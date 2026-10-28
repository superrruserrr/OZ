import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PwnedResult } from '@oz/auth';
import pg from 'pg';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { configureApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { AUTH_RESPONSE_FLOOR_MS, PWNED_CLIENT } from '../src/auth/auth.tokens.js';
import {
  MAILPIT_IMAGE,
  smtpHost,
  startServices,
  testKey,
  type TestServices,
} from './containers.js';
import { captureLogs, type LogCapture } from './log-capture.js';
import { testConfig } from './support.js';

// Banc des tests du module d'authentification : PostgreSQL migré, Redis, S3, Mailpit, et un double
// de HaveIBeenPwned dont la réponse est pilotée par le test.

const run = promisify(execFile);
const MIGRATE = new URL('../../../packages/db/dist/cli/migrate.js', import.meta.url).pathname;

export const RESPONSE_FLOOR_MS = 150;

export interface AuthHarness {
  readonly app: NestExpressApplication;
  readonly logs: LogCapture;
  readonly db: pg.Pool;
  /** Réponse du double HaveIBeenPwned pour les prochains appels. */
  pwned: PwnedResult;
  /** Dernier email reçu par `to` (texte), attendu jusqu'à 5 s. */
  mailTo(to: string, subject: string): Promise<string>;
  /** Emails reçus par `to`. */
  subjectsTo(to: string): Promise<string[]>;
  stop(): Promise<void>;
}

interface MailpitSummary {
  readonly ID: string;
  readonly Subject: string;
}

export async function startAuthHarness(
  overrides: Record<string, string> = {},
): Promise<AuthHarness> {
  const [services, mailpit] = await Promise.all<
    [Promise<TestServices>, Promise<StartedTestContainer>]
  >([
    startServices(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
  ]);
  await run(process.execPath, [MIGRATE], {
    env: { ...process.env, DATABASE_URL: services.env.DATABASE_URL },
  });
  const mailApi = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}`;
  const logs = captureLogs();
  const config = testConfig({
    ...services.env,
    LOG_LEVEL: 'info',
    FEATURE_AUTH: 'true',
    APP_URL: 'http://localhost:3000',
    // IP : nodemailer résout le nom par DNS (resolve4), lent pour « localhost » sur certains postes.
    SMTP_HOST: smtpHost(mailpit.getHost()),
    SMTP_PORT: String(mailpit.getMappedPort(1025)),
    EMAIL_FROM: 'OZ <no-reply@oz.localhost>',
    AUTH_HMAC_KEY: 'h'.repeat(40),
    JWT_ACCESS_SECRET: testKey(1),
    JWT_REFRESH_SECRET: testKey(2),
    ...overrides,
  });
  const harness = { pwned: 'clean' as PwnedResult };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logStream: logs.stream })],
  })
    .overrideProvider(PWNED_CLIENT)
    .useValue({ check: () => Promise.resolve(harness.pwned) })
    .overrideProvider(AUTH_RESPONSE_FLOOR_MS)
    .useValue(RESPONSE_FLOOR_MS)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const db = new pg.Pool({ connectionString: services.env.DATABASE_URL, max: 2 });

  const search = async (to: string): Promise<MailpitSummary[]> => {
    const response = await fetch(
      `${mailApi}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    return ((await response.json()) as { messages: MailpitSummary[] }).messages;
  };

  return Object.assign(harness, {
    app,
    logs,
    db,
    async mailTo(to: string, subject: string): Promise<string> {
      const deadline = Date.now() + 5_000;
      for (;;) {
        const found = (await search(to)).find((message) => message.Subject === subject);
        if (found) {
          const body = await fetch(`${mailApi}/api/v1/message/${found.ID}`);
          return ((await body.json()) as { Text: string }).Text;
        }
        if (Date.now() > deadline) throw new Error(`aucun email « ${subject} » pour ${to}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    async subjectsTo(to: string): Promise<string[]> {
      return (await search(to)).map((message) => message.Subject);
    },
    async stop(): Promise<void> {
      await app.close();
      await db.end();
      await Promise.all([services.stop(), mailpit.stop()]);
    },
  });
}

/** Jeton du lien d'un email (fragment `#token=`). */
export function tokenIn(text: string): string {
  const match = /#token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error('aucun jeton dans le message');
  return match[1];
}

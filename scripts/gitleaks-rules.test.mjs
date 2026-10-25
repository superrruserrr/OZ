// Simulation des règles gitleaks `oz-jwt-secret-*` (R8) tant que gitleaks n'est pas installé (DEBT D-003).
// Les règles sont lues dans .gitleaks.toml : ce test échoue si la configuration réelle change de comportement.
// Fidélité à gitleaks : correspondance, groupe secret, entropie de Shannon, liste blanche de la règle
// appliquée à la cible déclarée (`regexTarget`), sensible à la casse sauf `(?i)` explicite.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const toml = readFileSync(new URL('../.gitleaks.toml', import.meta.url), 'utf8');

// gitleaks utilise le moteur RE2 de Go : pas d'assertion avant/arrière ni de référence arrière.
const RE2_FORBIDDEN = /\(\?[=!<]|\\[1-9]/;

function toJsRegex(source, flags) {
  const insensitive = source.startsWith('(?i)');
  return new RegExp(insensitive ? source.slice(4) : source, flags + (insensitive ? 'i' : ''));
}

const rules = toml
  .split('[[rules]]')
  .slice(1)
  .map((block) => {
    const get = (name) => new RegExp(`^${name} = (.+)$`, 'm').exec(block)?.[1];
    const id = /^id = "(.+)"/m.exec(block)?.[1] ?? '';
    const regex = /^regex = '''(.+?)'''/m.exec(block)?.[1] ?? '';
    const allow = /^regexes = \['''(.+?)'''\]/m.exec(block)?.[1];
    return {
      id,
      regex,
      allow,
      allowTarget: /^regexTarget = "(\w+)"/m.exec(block)?.[1] ?? 'secret',
      secretGroup: Number(get('secretGroup') ?? '0'),
      entropy: Number(get('entropy') ?? '0'),
    };
  })
  .filter((rule) => rule.id.startsWith('oz-jwt-secret'));

function shannon(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Faux secrets assemblés à l'exécution : écrits en clair, ils feraient bloquer ce fichier par gitleaks.
const TOKEN = ['Zk3n8Qp1', 'Lx7Vt2Rb', '9Mw4'].join('');
const PUNCTUATED = ['kP9#xQ2!', 'mZ7@rL4$', 'vN8w'].join('');
const PASSPHRASE = ['correct horse', 'battery staple 42!'].join(' ');

function findings(text) {
  const results = [];
  for (const rule of rules) {
    const allow = rule.allow ? toJsRegex(rule.allow, '') : null;
    for (const match of text.matchAll(toJsRegex(rule.regex, 'g'))) {
      const secret = match[rule.secretGroup] ?? match[0];
      if (shannon(secret) < rule.entropy) continue;
      const target = rule.allowTarget === 'match' ? match[0] : secret;
      if (allow?.test(target)) continue;
      results.push(`${rule.id}: ${secret}`);
    }
  }
  return results;
}

describe('règles gitleaks oz-jwt-secret-* (R8)', () => {
  it('sont présentes et compatibles avec le moteur RE2 de gitleaks', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.regex).not.toMatch(RE2_FORBIDDEN);
      if (rule.allow) expect(rule.allow).not.toMatch(RE2_FORBIDDEN);
      expect(rule.allowTarget).toBe('secret');
    }
  });

  it.each([
    ['variable d’environnement', `JWT_ACCESS_SECRET=${TOKEN}`],
    ['nom court', `JWT_SECRET=${TOKEN}`],
    ['suffixe après secret', `JWT_SECRET_KEY=${TOKEN}`],
    ['camelCase dans du code', `jwtRefreshSecret: '${TOKEN}'`],
    ['kebab-case en YAML', `jwt-secret: ${TOKEN}`],
    ['ponctuation entre guillemets', `JWT_SECRET="${PUNCTUATED}"`],
    ['phrase avec espaces', `JWT_SECRET="${PASSPHRASE}"`],
    ['affectation Go', `jwt_secret := "${TOKEN}"`],
    ['secret suivi d’un commentaire citant ${…}', `JWT_SECRET=${TOKEN} # ancien: ${'$'}{VAULT}`],
    [
      'secret suivi d’un commentaire citant process.env',
      `JWT_SECRET=${TOKEN} # avant: process.env`,
    ],
  ])('détecte un secret en clair : %s', (_, line) => {
    expect(findings(line)).toHaveLength(1);
  });

  it.each([
    [
      'valeur vide suivie d’une autre ligne (.env.example)',
      ['JWT_ACCESS_SECRET=', 'DATABASE_URL=postgresql://oz:oz@localhost:5432/oz'].join('\n'),
    ],
    [
      'valeur vide suivie d’un commentaire (gabarit du plan, Annexe C)',
      'JWT_ACCESS_SECRET=            # 64 octets aléatoires — jamais réutilisé entre environnements',
    ],
    ['lecture de process.env', 'jwtSecret: process.env.JWT_ACCESS_SECRET,'],
    ['lecture d’un objet env', 'jwtSecret: env.JWT_ACCESS_SECRET,'],
    ['référence de coffre ${…}', 'JWT_SECRET=${JWT_SECRET_FROM_VAULT}'],
    ['ConfigService.get', "jwtAccessSecret: configService.get('JWT_ACCESS_SECRET'),"],
    [
      'ConfigService.getOrThrow typé',
      'jwtAccessSecret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),',
    ],
    ['config.get typé', 'jwtSecret: config.get<string>("JWT_SECRET"),'],
    ['schéma Zod d’environnement', 'JWT_ACCESS_SECRET: z.string().min(32),'],
    ['import.meta.env', 'jwtSecret: import.meta.env.VITE_JWT_SECRET_NAME,'],
    [
      'documentation en prose',
      'JWT_ACCESS_SECRET : secret de signature des jetons, 256 bits minimum',
    ],
    ['liste en prose', '- JWT_ACCESS_SECRET: généré par openssl rand -base64 48'],
    ['durée de vie, pas un secret', 'JWT_ACCESS_TTL=15m'],
  ])('ne bloque pas du code ou une documentation légitime : %s', (_, text) => {
    expect(findings(text)).toEqual([]);
  });

  it('ne déclenche sur aucun fichier destiné au dépôt', () => {
    const listed = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(listed.status).toBe(0);
    const files = listed.stdout
      .split('\0')
      .filter((file) => file && !file.endsWith('pnpm-lock.yaml'))
      // Fichiers suivis mais supprimés de la copie de travail : listés par git, absents du disque.
      .filter((file) => existsSync(new URL(file, `file://${root}/`)));
    const hits = files.flatMap((file) => {
      const content = readFileSync(new URL(file, `file://${root}/`), 'utf8');
      return findings(content).map((finding) => `${file} — ${finding}`);
    });
    expect(hits).toEqual([]);
  });
});

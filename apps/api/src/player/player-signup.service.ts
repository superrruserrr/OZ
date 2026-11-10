import { Inject, Injectable } from '@nestjs/common';
import type { ApiConfig } from '@oz/config';
import { profileCompleteness } from '@oz/core';
import {
  SIGNUP_STEPS,
  signupAffiliationSchema,
  signupGuardianSchema,
  signupIdentitySchema,
  signupSportSchema,
  type SignupCompleteOutput,
  type SignupStatusOutput,
  type SignupStepParamsInput,
} from '@oz/contracts';
import {
  completePlayerSignup,
  issueOzId,
  readPlayerSignup,
  savePlayerSignupStep,
  withUserContext,
  type PlayerSignupDraft,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { z } from 'zod';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';

type SignupStep = SignupStepParamsInput['step'];

const STEP_SCHEMAS = {
  identity: signupIdentitySchema,
  sport: signupSportSchema,
  affiliation: signupAffiliationSchema,
  guardian: signupGuardianSchema,
} as const satisfies Record<SignupStep, z.ZodType>;

const COMPLETED = (): AppException =>
  new AppException(409, 'SIGNUP_ALREADY_COMPLETED', 'Ce compte a déjà sa fiche joueur.');
const INVALID = (): AppException => new AppException(422, 'VALIDATION_FAILED', 'Étape refusée.');
/** Compte inutilisable ou rôle joueur retiré : même réponse, sans motif. */
const REFUSED = (): AppException =>
  new AppException(403, 'SIGNUP_REFUSED', 'Inscription impossible pour ce compte.');
const MISSING = (missing: readonly SignupStep[]): AppException =>
  new AppException(
    422,
    missing.length === 1 && missing[0] === 'guardian'
      ? 'SIGNUP_GUARDIAN_REQUIRED'
      : 'SIGNUP_INCOMPLETE',
    'Des étapes de l’inscription manquent.',
    missing.map((step) => ({ field: step, code: 'required' })),
  );

type Finalization =
  | { readonly outcome: 'completed' | 'refused' | 'invalid' }
  | { readonly outcome: 'missing'; readonly missing: readonly SignupStep[] }
  | {
      readonly outcome: 'created';
      readonly minor: boolean;
      readonly ozId: string;
      readonly steps: SignupStatusOutput['steps'];
    };

/** Étape relue et revalidée : un brouillon d'un contrat plus ancien est simplement à ressaisir. */
function parsed<S extends SignupStep>(
  step: S,
  value: Readonly<Record<string, unknown>> | null,
): z.infer<(typeof STEP_SCHEMAS)[S]> | null {
  if (value === null) return null;
  const result = STEP_SCHEMAS[step].safeParse(value);
  return result.success ? (result.data as z.infer<(typeof STEP_SCHEMAS)[S]>) : null;
}

function status(draft: PlayerSignupDraft | null): SignupStatusOutput {
  const steps = {
    identity: parsed('identity', draft?.identity ?? null),
    sport: parsed('sport', draft?.sport ?? null),
    affiliation: parsed('affiliation', draft?.affiliation ?? null),
    guardian: parsed('guardian', draft?.guardian ?? null),
  };
  const minor = steps.identity === null ? null : (draft?.minor ?? null);
  const missing = SIGNUP_STEPS.filter(
    (step) => steps[step] === null && (step !== 'guardian' || minor === true),
  );
  return { steps, minor, missing, expiresAt: draft ? draft.expiresAt.toISOString() : null };
}

/**
 * Inscription joueur (lot 1.7a, EX-107) : étapes enregistrées chiffrées côté serveur et reprises
 * après interruption ; la finalisation crée la fiche `declared`, le tuteur déclaré d'un mineur
 * (bloquant, D4), le rôle joueur et l'OZ ID dans une seule transaction. Le journal applicatif ne
 * porte aucune donnée saisie.
 */
@Injectable()
export class PlayerSignupService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(PlayerSignupService.name) private readonly logger: PinoLogger,
  ) {}

  async read(userId: string): Promise<SignupStatusOutput> {
    const outcome = await withUserContext(this.db, userId, (tx) =>
      readPlayerSignup(tx, this.keys().encryptionKey),
    );
    if (outcome.outcome === 'completed') throw COMPLETED();
    if (outcome.outcome === 'refused') throw REFUSED();
    return status(outcome.outcome === 'draft' ? outcome.draft : null);
  }

  async save(
    userId: string,
    step: SignupStep,
    data: Readonly<Record<string, unknown>>,
  ): Promise<SignupStatusOutput> {
    await this.limit(userId);
    const { encryptionKey } = this.keys();
    const outcome = await withUserContext(this.db, userId, async (tx) => {
      const saved = await savePlayerSignupStep(tx, { step, data, encryptionKey });
      return saved.outcome === 'saved' ? await readPlayerSignup(tx, encryptionKey) : saved;
    });
    if (outcome.outcome === 'completed') throw COMPLETED();
    if (outcome.outcome === 'invalid') throw INVALID();
    if (outcome.outcome === 'refused') throw REFUSED();
    this.logger.info({ step }, 'Étape d’inscription enregistrée');
    return status(outcome.outcome === 'draft' ? outcome.draft : null);
  }

  async complete(userId: string): Promise<SignupCompleteOutput> {
    await this.limit(userId);
    const keys = this.keys();
    const result = await withUserContext(this.db, userId, async (tx): Promise<Finalization> => {
      // Revalidation par les contrats du moment (C2) avant la base : une étape d'un contrat plus
      // ancien est à ressaisir, exactement comme la reprise l'annonce.
      const draft = await readPlayerSignup(tx, keys.encryptionKey);
      if (draft.outcome === 'completed' || draft.outcome === 'refused') return draft;
      const current = status(draft.outcome === 'draft' ? draft.draft : null);
      if (current.missing.length > 0) return { outcome: 'missing', missing: current.missing };
      const outcome = await completePlayerSignup(tx, keys);
      if (outcome.outcome !== 'created') return outcome;
      const { ozId } = await issueOzId(tx, outcome.playerId);
      return { outcome: 'created', minor: outcome.minor, ozId, steps: current.steps };
    });
    switch (result.outcome) {
      case 'completed':
        throw COMPLETED();
      case 'refused':
        throw REFUSED();
      case 'invalid':
        throw INVALID();
      case 'missing':
        throw MISSING(result.missing);
      case 'created':
        break;
    }
    this.logger.info({ minor: result.minor }, 'Inscription joueur finalisée');
    return {
      ozId: result.ozId,
      verificationStatus: 'declared',
      minor: result.minor,
      completeness: profileCompleteness({ ...result.steps.identity, ...result.steps.sport }),
    };
  }

  private async limit(userId: string): Promise<void> {
    const decision = await this.limiter.consume('player_signup_account', userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }

  private keys(): { encryptionKey: string; blindIndexKey: string } {
    const auth = this.config.auth;
    // Le module n'est monté qu'avec FEATURE_AUTH : les clés sont toujours là.
    if (auth === undefined) throw new Error('Clés de chiffrement des colonnes absentes.');
    return { encryptionKey: auth.columnEncryptionKey, blindIndexKey: auth.blindIndexKey };
  }
}

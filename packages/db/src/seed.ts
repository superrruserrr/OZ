import type { AppEnv } from '@oz/config';
import {
  createOrganizationFactory,
  createPersonFactory,
  REFERENCE_DATE,
  type SyntheticPerson,
} from '@oz/testing';
import type { RandomSource } from '@oz/core';
import { createDbClient } from './client.js';
import { issueOzIdWithSource } from './oz-id.js';
import type { TransactionClient } from './session-context.js';

/** Graine du jeu synthétique : la changer change toutes les données générées. */
export const SEED = 2026;

/** Taille du jeu (D7 du lot 1.1) : un joueur sur trois est mineur à la date de référence. */
export const SEED_PLAYERS = 500;
const ORGANIZATIONS_PER_TYPE = 5;
const ACCOUNTS_PER_ROLE = 2;

// Réglages techniques du poste et de la prévisualisation.
const SETTINGS = [
  {
    key: 'seed.dataset',
    value: { synthetic: true, source: '@oz/testing', seed: SEED, referenceDate: REFERENCE_DATE },
  },
  { key: 'platform.default_locale', value: 'fr' },
  { key: 'platform.supported_locales', value: ['fr', 'en'] },
] as const;

/** Marqueur posé dans la même transaction que les profils : sa présence rend les seeds idempotentes. */
const PROFILES_MARKER = 'seed.profiles';

const POSITIONS = [
  'goalkeeper',
  'centre_back',
  'full_back',
  'defensive_midfielder',
  'central_midfielder',
  'attacking_midfielder',
  'winger',
  'striker',
] as const;
const FEET = ['right', 'left', 'both'] as const;
const RELATIONSHIPS = ['mother', 'father', 'legal_guardian'] as const;
/** Villes par pays des données synthétiques (SYNTHETIC_COUNTRIES). */
const CITIES: Readonly<Record<string, readonly string[]>> = {
  CM: ['Yaoundé', 'Douala', 'Bafoussam'],
  CI: ['Abidjan', 'Bouaké'],
  SN: ['Dakar', 'Thiès'],
  NG: ['Lagos', 'Abuja'],
  GH: ['Accra', 'Kumasi'],
  FR: ['Paris', 'Marseille'],
};
/** Rôle d'organisation → type d'organisation des comptes seedés. */
const ORGANIZATION_ROLES = {
  academy: 'academy',
  club: 'club',
  federation: 'federation',
  center: 'center',
  recruiter: 'recruiter',
} as const;

export interface SeedSummary {
  readonly settings: number;
  /** Faux si les profils existaient déjà : rien n'a été créé. */
  readonly profilesCreated: boolean;
  readonly players: number;
  readonly organizations: number;
}

type Keys = { encryptionKey: string; blindIndexKey: string } | undefined;

/**
 * Remplit une base locale ou de prévisualisation avec des données synthétiques déterministes (R10,
 * EX-T10.1, EX-101 n° 8) : 500 joueurs dont un tiers de mineurs (chacun avec tuteur et consentement
 * parental), chacun avec son OZ ID (lot 1.2), 30 organisations, des comptes pour chaque rôle. Idempotent : relancer ne duplique ni ne
 * modifie rien. Sans clés de chiffrement, les colonnes chiffrées restent vides. Refusé en recette et
 * en production, qui ne reçoivent que des données anonymisées ou réelles.
 */
export async function seedDatabase(options: {
  databaseUrl: string;
  appEnv: AppEnv;
  encryptionKey?: string | undefined;
  blindIndexKey?: string | undefined;
}): Promise<SeedSummary> {
  if (options.appEnv === 'staging' || options.appEnv === 'production') {
    throw new Error(
      `Seeds refusées en ${options.appEnv} : données synthétiques réservées au poste et à la prévisualisation (R10).`,
    );
  }
  const keys: Keys =
    options.encryptionKey && options.blindIndexKey
      ? { encryptionKey: options.encryptionKey, blindIndexKey: options.blindIndexKey }
      : undefined;
  const db = createDbClient(options.databaseUrl);
  try {
    for (const { key, value } of SETTINGS) {
      // `update: {}` : une valeur déjà présente n'est jamais réécrite (idempotence stricte).
      await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: {} });
    }
    const profilesCreated = await db.$transaction(
      async (tx) => {
        // Verrou de la transaction : deux seeds simultanées ne créent pas deux jeux.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED})`;
        if (await tx.systemSetting.findUnique({ where: { key: PROFILES_MARKER } })) return false;
        await seedProfiles(tx, keys);
        await tx.systemSetting.create({
          data: {
            key: PROFILES_MARKER,
            value: { players: SEED_PLAYERS, organizations: ORGANIZATIONS_PER_TYPE * 6 },
          },
        });
        return true;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return {
      settings: SETTINGS.length,
      profilesCreated,
      players: SEED_PLAYERS,
      organizations: ORGANIZATIONS_PER_TYPE * 6,
    };
  } finally {
    await db.$disconnect();
  }
}

/**
 * Colonne chiffrée et son index aveugle : `$1` et `$2` portent les clés, NULL sans clés (colonne vide).
 * Chaque paramètre reste référencé et typé, avec ou sans clés.
 */
function secret(index: number): { encrypted: string; hmac: string } {
  const value = `$${String(index)}::text`;
  return {
    encrypted: `CASE WHEN $1::text IS NULL THEN NULL ELSE oz_encrypt(${value}, $1::text) END`,
    hmac: `CASE WHEN $2::text IS NULL THEN NULL ELSE oz_blind_index(${value}, $2::text) END`,
  };
}

const keyParams = (keys: Keys): (string | null)[] => [
  keys?.encryptionKey ?? null,
  keys?.blindIndexKey ?? null,
];

async function insertReturningId(
  tx: TransactionClient,
  sql: string,
  values: unknown[],
): Promise<string> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(sql, ...values);
  const id = rows[0]?.id;
  if (!id) throw new Error('Seeds : insertion sans identifiant renvoyé.');
  return id;
}

async function insertUser(tx: TransactionClient, email: string): Promise<string> {
  return insertReturningId(
    tx,
    `INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id::text`,
    [email],
  );
}

async function seedProfiles(tx: TransactionClient, keys: Keys): Promise<void> {
  // Séries distinctes : téléphones et emails uniques entre joueurs, tuteurs et comptes.
  const players = createPersonFactory(SEED);
  const guardians = createPersonFactory(SEED, { start: 100_000 });
  const staff = createPersonFactory(SEED, { start: 200_000 });

  const playerIds: string[] = [];
  let admin: string | undefined;
  const organizations = new Map<string, string[]>();
  for (const org of createOrganizationFactory(SEED).organizations(ORGANIZATIONS_PER_TYPE * 6)) {
    const id = await insertReturningId(
      tx,
      `INSERT INTO organizations (type, name, registration_number, country, city, contact_email)
       VALUES ($1::organization_type, $2, $3, $4, $5, $6) RETURNING id::text`,
      [
        org.type,
        org.name,
        org.registrationNumber,
        org.country,
        CITIES[org.country]?.[0] ?? null,
        org.contactEmail,
      ],
    );
    organizations.set(org.type, [...(organizations.get(org.type) ?? []), id]);
  }
  const homeClubs = [...(organizations.get('academy') ?? []), ...(organizations.get('club') ?? [])];

  for (let i = 0; i < SEED_PLAYERS; i += 1) {
    const minor = i % 3 === 0;
    // Âges à la date de référence : 10 à 16 ans pour les mineurs, 18 à 35 ans pour les majeurs.
    const person = players.person({ age: minor ? 10 + (i % 7) : 18 + (i % 18) });
    const userId = minor ? null : await insertUser(tx, person.email);
    const guardianId = minor
      ? await insertGuardian(tx, keys, guardians.person({ age: 30 + (i % 20) }), i, person.country)
      : null;
    const cities = CITIES[person.country] ?? [];
    const phone = secret(3);
    const document = secret(4);
    const playerId = await insertReturningId(
      tx,
      `INSERT INTO players (user_id, guardian_id, organization_id, first_name, last_name, birth_date,
         nationality, country, city, primary_position, dominant_foot, height_cm,
         phone_encrypted, phone_hmac, document_number_encrypted, document_number_hmac)
       VALUES ($5::uuid, $6::uuid, $7::uuid, $8, $9, $10::date, $11, $11, $12, $13::player_position,
         $14::dominant_foot, $15, ${phone.encrypted}, ${phone.hmac}, ${document.encrypted}, ${document.hmac})
       RETURNING id::text`,
      [
        ...keyParams(keys),
        person.phone,
        person.documentNumber,
        userId,
        guardianId,
        homeClubs[i % homeClubs.length] ?? null,
        person.firstName,
        person.lastName,
        person.birthDate,
        person.country,
        cities[i % Math.max(cities.length, 1)] ?? null,
        POSITIONS[i % POSITIONS.length],
        FEET[i % FEET.length],
        150 + (i % 45),
      ],
    );
    playerIds.push(playerId);
    if (userId) {
      await tx.$executeRawUnsafe(
        `INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, 'player')`,
        userId,
      );
    }
    if (guardianId) {
      await tx.$executeRawUnsafe(
        `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
         VALUES ('guardian_data_processing', '2026-01', $1::uuid, $2::uuid)`,
        playerId,
        guardianId,
      );
    }
  }

  // Comptes de chaque rôle : personnels (tuteur, administrateur) ou rattachés à une organisation.
  for (let n = 0; n < ACCOUNTS_PER_ROLE; n += 1) {
    for (const role of ['guardian', 'admin'] as const) {
      const id = await insertUser(tx, staff.person().email);
      await tx.$executeRawUnsafe(
        `INSERT INTO user_roles (user_id, role) VALUES ($1::uuid, $2::role_kind)`,
        id,
        role,
      );
      if (role === 'admin') admin ??= id;
    }
    for (const [role, type] of Object.entries(ORGANIZATION_ROLES)) {
      const id = await insertUser(tx, staff.person().email);
      await tx.$executeRawUnsafe(
        `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1::uuid, $2::role_kind, $3::uuid)`,
        id,
        role,
        organizations.get(type)?.[n] ?? null,
      );
    }
  }

  // OZ ID de chaque joueur, émis par le chemin applicatif (oz_issue_oz_id) au nom d'un administrateur
  // seedé, avec un aléa à graine fixe : mêmes seeds, mêmes OZ ID (sauf changement d'année).
  if (!admin) throw new Error('Seeds : aucun administrateur pour émettre les OZ ID.');
  await tx.$executeRaw`SELECT set_config('oz.user_id', ${admin}, true)`;
  const source = seededSource(SEED);
  for (const playerId of playerIds) await issueOzIdWithSource(tx, playerId, source);
}

/** Aléa déterministe (mulberry32) réservé aux seeds : jamais pour un OZ ID réel. */
function seededSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return (target) => {
    for (let i = 0; i < target.length; i += 1) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      target[i] = ((t ^ (t >>> 14)) >>> 24) & 0xff;
    }
  };
}

async function insertGuardian(
  tx: TransactionClient,
  keys: Keys,
  person: SyntheticPerson,
  index: number,
  country: string,
): Promise<string> {
  const phone = secret(3);
  const email = secret(4);
  const document = secret(5);
  return insertReturningId(
    tx,
    `INSERT INTO guardians (first_name, last_name, relationship, country,
       phone_encrypted, phone_hmac, email_encrypted, email_hmac, document_number_encrypted, document_number_hmac)
     VALUES ($6, $7, $8::guardian_relationship, $9, ${phone.encrypted}, ${phone.hmac},
       ${email.encrypted}, ${email.hmac}, ${document.encrypted}, ${document.hmac})
     RETURNING id::text`,
    [
      ...keyParams(keys),
      person.phone,
      person.email,
      person.documentNumber,
      person.firstName,
      person.lastName,
      RELATIONSHIPS[index % RELATIONSHIPS.length],
      country,
    ],
  );
}

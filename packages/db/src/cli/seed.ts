import { seedDatabase } from '../seed.js';
import { commandEnvironment, fail } from './environment.js';

// pnpm db:seed — clés de chiffrement facultatives : sans elles, les colonnes chiffrées restent vides.
try {
  const summary = await seedDatabase({
    ...commandEnvironment(),
    encryptionKey: process.env.DATABASE_ENCRYPTION_KEY,
    blindIndexKey: process.env.DATABASE_BLIND_INDEX_KEY,
  });
  process.stdout.write(
    summary.profilesCreated
      ? `✓ ${String(summary.players)} joueurs et ${String(summary.organizations)} organisations synthétiques créés.\n`
      : '✓ Jeu synthétique déjà en place : rien à créer.\n',
  );
} catch (error) {
  fail(error);
}

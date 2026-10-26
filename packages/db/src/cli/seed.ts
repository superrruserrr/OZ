import { seedDatabase } from '../seed.js';
import { commandEnvironment, fail } from './environment.js';

// pnpm db:seed
try {
  const count = await seedDatabase(commandEnvironment());
  process.stdout.write(`✓ ${String(count)} réglages synthétiques en place.\n`);
} catch (error) {
  fail(error);
}

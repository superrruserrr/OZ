/**
 * La commande Prisma en cours a-t-elle besoin de la base ? Sans DATABASE_URL, la CLI Prisma 7 peut sortir
 * en succès sans rien faire (`migrate diff`, `migrate status`) : prisma.config.ts refuse alors de charger.
 */
export function commandNeedsDatabase(argv: readonly string[]): boolean {
  const [command] = argv.slice(2).filter((arg) => !arg.startsWith('-'));
  return command === 'migrate' || command === 'db' || command === 'studio';
}

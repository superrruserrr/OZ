// Après `next build` (sortie standalone) : copie les fichiers statiques que Next ne recopie pas
// dans le serveur autonome (.next/static, public/). Lancé depuis le dossier de l'application.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const app = process.cwd();
const workspaceRoot = join(app, '..', '..');
const target = join(app, '.next', 'standalone', relative(workspaceRoot, app));
if (!existsSync(target)) {
  console.error(`Sortie standalone introuvable : ${target}`);
  process.exit(1);
}
for (const [from, to] of [
  [join(app, '.next', 'static'), join(target, '.next', 'static')],
  [join(app, 'public'), join(target, 'public')],
]) {
  // Toujours vider la cible : un dossier supprimé de l'application ne doit pas rester servi.
  rmSync(to, { recursive: true, force: true });
  if (!existsSync(from)) continue;
  cpSync(from, to, { recursive: true });
  console.log(`✓ ${basename(from)} copié dans le serveur autonome.`);
}

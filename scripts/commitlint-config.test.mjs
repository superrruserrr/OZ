// commitlint : les commits de Dependabot (liens de comparaison longs) ne bloquent pas la CI — les lignes
// contenant une URL échappent à body-max-line-length — sans affaiblir la règle. Testé par la CLI.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url).pathname;
const valid = (message) =>
  spawnSync('pnpm', ['exec', 'commitlint'], { cwd: root, input: message, encoding: 'utf8' })
    .status === 0;

const longLine = `- [Commits](https://github.com/actions/checkout/compare/${'a'.repeat(40)}...${'b'.repeat(40)})`;

describe('commitlint.config.mjs', () => {
  it('accepte un commit de Dependabot malgré ses lignes longues', () => {
    expect(
      valid(
        `chore(deps): bump the github-actions group with 2 updates\n\n${longLine}\n\nSigned-off-by: dependabot[bot] <support@github.com>\n`,
      ),
    ).toBe(true);
  });

  it('refuse toujours une ligne de corps trop longue sans URL', () => {
    expect(valid(`chore(deps): mise à jour\n\n${'mot '.repeat(30)}\n`)).toBe(false);
  });

  it('refuse un titre non conventionnel (titre de PR squashé)', () => {
    expect(valid('Update stuff\n')).toBe(false);
  });
});

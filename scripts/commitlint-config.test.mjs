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

  it('accepte le titre long d’une montée groupée de Dependabot (chemin et groupe, PR #28)', () => {
    const header =
      'chore(deps): Bump distroless/nodejs24-debian13 from cb60632 to 206cfba in /infra/docker/images in the docker-images group';
    expect(header.length).toBeGreaterThan(100);
    expect(valid(`${header}\n`)).toBe(true);
    // Titre de la PR (contrôlé par la CI) : Dependabot y met les condensés entre accents graves.
    expect(valid(`${header.replace(/(cb60632|206cfba)/g, '`$1`')}\n`)).toBe(true);
  });

  it('refuse toujours un titre de plus de 100 caractères qui n’a pas la forme Dependabot', () => {
    expect(valid(`chore(deps): ${'montée '.repeat(14)}\n`)).toBe(false);
    expect(valid(`feat(auth): bump a from 1 to 2 in /x in the ${'g'.repeat(80)} group\n`)).toBe(
      false,
    );
  });

  it('plafonne même un titre Dependabot à 200 caractères', () => {
    expect(
      valid(
        `chore(deps): Bump ${'p'.repeat(150)} from 1.0.0 to 2.0.0 in /infra in the npm group\n`,
      ),
    ).toBe(false);
  });

  it('accepte le corps d’une montée groupée d’images Docker (sans URL, PR #28 rebasée)', () => {
    const message = [
      'chore(deps): Bump distroless/nodejs24-debian13',
      '',
      'Bumps the docker-images group with 1 update in the /infra/docker/images directory: distroless/nodejs24-debian13.',
      '',
      '',
      'Updates `distroless/nodejs24-debian13` from `cb60632` to `206cfba`',
      '',
      '---',
      'updated-dependencies:',
      '- dependency-name: distroless/nodejs24-debian13',
      `  dependency-version: ${'2'.repeat(64)}`,
      '  dependency-type: direct:production',
      '  dependency-group: docker-images',
      '...',
      '',
      'Signed-off-by: dependabot[bot] <support@github.com>',
      '',
    ].join('\n');
    expect(valid(message)).toBe(true);
  });

  it('plafonne même une phrase Dependabot du corps à 200 caractères', () => {
    expect(
      valid(
        `chore(deps): bump x\n\nBumps the docker-images group with 1 update in the / directory: ${'i'.repeat(150)}.\n`,
      ),
    ).toBe(false);
  });

  it('refuse toujours une ligne de corps trop longue sans URL', () => {
    expect(valid(`chore(deps): mise à jour\n\n${'mot '.repeat(30)}\n`)).toBe(false);
  });

  it('refuse un titre non conventionnel (titre de PR squashé)', () => {
    expect(valid('Update stuff\n')).toBe(false);
  });
});

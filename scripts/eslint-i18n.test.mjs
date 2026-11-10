// Règle « aucune chaîne d'interface en dur » (EX-T21.3) sur les pages des applications Next.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: new URL('..', import.meta.url).pathname });

async function messages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId);
}

const page = (body) => `export default function Page() {\n  return ${body};\n}\n`;

describe('i18n : chaîne en dur interdite dans les pages', () => {
  it.each(['apps/web/src/app/[locale]/(site)/page.tsx', 'apps/admin/src/app/page.tsx'])(
    'refuse un texte JSX littéral (%s)',
    async (filePath) => {
      expect(await messages(page('<p>Bienvenue</p>'), filePath)).toContain('no-restricted-syntax');
    },
  );

  it('refuse aussi un texte dans un attribut lisible (alt, aria-label, title, placeholder)', async () => {
    const code = page('<img alt="Logo OZ" src="/a.svg" />');
    expect(await messages(code, 'apps/web/src/app/[locale]/(site)/page.tsx')).toContain(
      'no-restricted-syntax',
    );
  });

  it('accepte une traduction et les espaces de mise en page', async () => {
    const code = `import { useTranslations } from 'next-intl';\n${page("<p>\n  {useTranslations('home')('title')}\n</p>")}`;
    expect(await messages(code, 'apps/web/src/app/[locale]/(site)/page.tsx')).not.toContain(
      'no-restricted-syntax',
    );
  });
});

describe('CSP : aucun attribut style en dur (style-src sans unsafe-inline)', () => {
  it.each(['apps/web/src/app/[locale]/(site)/page.tsx', 'apps/admin/src/app/page.tsx'])(
    'refuse style={{…}} (%s)',
    async (filePath) => {
      expect(await messages(page("<p style={{ color: 'red' }} />"), filePath)).toContain(
        'no-restricted-syntax',
      );
    },
  );
});

describe('contournements relevés en revue (lot 0.4, tour 2)', () => {
  const file = 'apps/web/src/app/[locale]/(site)/page.tsx';
  it.each([
    ['texte entre accolades', page("<p>{'Bienvenue'}</p>")],
    ['gabarit entre accolades', page('<p>{`Bienvenue`}</p>')],
    ['texte dans un fragment', page("<>{'Bienvenue'}</>")],
    ['attribut lisible entre accolades', page("<nav aria-label={'Langue'} />")],
    ['attribut lisible en gabarit', page('<img alt={`Logo`} src="/a.svg" />')],
    ['titre de métadonnées en dur', "export const metadata = { title: 'Accueil' };\n"],
    ['description de métadonnées en gabarit', 'export const metadata = { description: `OZ` };\n'],
    ['style passé par décomposition', page("<p {...{ style: { color: 'red' } }} />")],
    [
      'createElement (contourne les règles JSX)',
      "import { createElement } from 'react';\nexport default function Page() {\n  return createElement('p', null, 'Salut');\n}\n",
    ],
  ])('refuse : %s', async (_, code) => {
    expect(await messages(code, file)).toContain('no-restricted-syntax');
  });

  it.each([
    ['classes Tailwind entre accolades', page("<p className={'text-oz-text'} />")],
    ['identifiant de test', page('<a href="/" data-testid="home-link" />')],
    [
      'clé de traduction',
      "import { useTranslations } from 'next-intl';\n" +
        page("<p>{useTranslations('home')('title')}</p>"),
    ],
  ])('accepte : %s', async (_, code) => {
    expect(await messages(code, file)).not.toContain('no-restricted-syntax');
  });
});

describe('contournements relevés en revue (lot 0.4, tour 3)', () => {
  const file = 'apps/web/src/app/[locale]/(site)/page.tsx';
  const withFlag = (body) =>
    `export default function Page({ x }: { x: boolean }) {\n  return ${body};\n}\n`;
  it.each([
    ['condition ternaire', withFlag("<p>{x ? 'Bonjour' : 'Salut'}</p>")],
    ['condition &&', withFlag("<p>{x && 'Bonjour'}</p>")],
    ['condition ||', withFlag("<p>{x || 'Bonjour'}</p>")],
    ['concaténation', page("<p>{'Bon' + 'jour'}</p>")],
    ['tableau de textes', page("<p>{['Bonjour']}</p>")],
    ['attribut lisible conditionnel', withFlag("<nav aria-label={x ? 'Nom' : 'Prénom'} />")],
    ['valeur de bouton', page('<input type="submit" value="Envoyer" />')],
    ['valeur de bouton entre accolades', page('<input type="submit" value={\'Envoyer\'} />')],
  ])('refuse : %s', async (_, code) => {
    expect(await messages(code, file)).toContain('no-restricted-syntax');
  });

  it.each([
    [
      'classes conditionnelles',
      withFlag("<p className={x ? 'text-oz-primary' : 'text-oz-text'} />"),
    ],
    ['valeur numérique', page('<input type="range" value={3} readOnly />')],
  ])('accepte : %s', async (_, code) => {
    expect(await messages(code, file)).not.toContain('no-restricted-syntax');
  });
});

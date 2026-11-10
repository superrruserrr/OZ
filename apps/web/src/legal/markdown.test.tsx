import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from './markdown';

// Sous-ensemble Markdown des textes légaux (lot 1.6, D2) : sans HTML injecté.

const SOURCE = `# Titre

> **Statut : interne.** Note de l'équipe.
> Suite de la note.

Un paragraphe avec **gras**, \`code\` et un [lien](cgu.md)
sur deux lignes.

## Section

- premier point ;
- second point
  qui continue.

1. un
2. deux

| A | B |
| --- | --- |
| x | **y** |

<script>alert(1)</script>
`;

describe('parseMarkdown', () => {
  it('blocs : titres, citation, paragraphe, listes, tableau', () => {
    const kinds = parseMarkdown(SOURCE).map((block) => block.kind);
    expect(kinds).toEqual([
      'heading',
      'quote',
      'paragraph',
      'heading',
      'list',
      'list',
      'table',
      'paragraph',
    ]);
  });
});

describe('Markdown', () => {
  it('rend titres, listes et tableau ; ignore la note de statut interne', () => {
    render(
      <Markdown
        source={SOURCE}
        skipLeadingQuote
        resolveHref={(href) => `/legal/${href.replace('.md', '')}`}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Titre');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Section');
    expect(document.body.textContent).not.toContain('Note de l');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem')[1]?.textContent).toBe('second point qui continue.');
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeTruthy();
    expect(screen.getByText('y').tagName).toBe('STRONG');
  });

  it('gras, code et liens réécrits ; jamais de HTML brut', () => {
    render(
      <Markdown source={SOURCE} resolveHref={(href) => `/legal/${href.replace('.md', '')}`} />,
    );
    expect(screen.getByText('gras').tagName).toBe('STRONG');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'lien' }).getAttribute('href')).toBe('/legal/cgu');
    expect(document.querySelector('script')).toBeNull();
    expect(document.body.textContent).toContain('<script>alert(1)</script>');
    expect(document.body.textContent).toContain('Note de l');
  });

  it('lien sans correspondance : texte seul (jamais de lien externe non prévu)', () => {
    render(
      <Markdown source="Voir [ailleurs](https://exemple.test)." resolveHref={() => undefined} />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.body.textContent).toBe('Voir ailleurs.');
  });
});

import type { ReactNode } from 'react';

/*
 * Sous-ensemble Markdown des textes légaux (lot 1.6, D2) : titres, paragraphes, listes, tableaux,
 * citations, gras, code et liens. Tout est rendu en nœuds React : aucun HTML de la source n'est
 * interprété. Les liens ne sont gardés que si `resolveHref` leur donne une route du site.
 */

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const LIST_ITEM = /^(?:-|\d+\.)\s+/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const chunks = source.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter((line) => line.trim() !== '');
    const first = lines[0];
    if (first === undefined) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(first);
    if (heading && lines.length === 1) {
      blocks.push({
        kind: 'heading',
        level: (heading[1]?.length ?? 1) as 1 | 2 | 3,
        text: heading[2] ?? '',
      });
    } else if (first.startsWith('>')) {
      blocks.push({
        kind: 'quote',
        text: lines.map((line) => line.replace(/^>\s?/, '')).join(' '),
      });
    } else if (first.trim().startsWith('|')) {
      const [head = '', , ...rows] = lines;
      blocks.push({ kind: 'table', head: cells(head), rows: rows.map(cells) });
    } else if (LIST_ITEM.test(first)) {
      const items: string[] = [];
      for (const line of lines) {
        if (LIST_ITEM.test(line)) items.push(line.replace(LIST_ITEM, ''));
        else items[items.length - 1] = `${items.at(-1) ?? ''} ${line.trim()}`;
      }
      blocks.push({ kind: 'list', ordered: /^\d+\./.test(first), items });
    } else {
      blocks.push({ kind: 'paragraph', text: lines.map((line) => line.trim()).join(' ') });
    }
  }
  return blocks;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;

function inline(text: string, resolveHref: (href: string) => string | undefined): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) nodes.push(text.slice(last, index));
    const [, bold, code, label, href] = match;
    const key = String(index);
    if (bold !== undefined) nodes.push(<strong key={key}>{inline(bold, resolveHref)}</strong>);
    else if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
    else if (label !== undefined) {
      const target = href === undefined ? undefined : resolveHref(href);
      nodes.push(
        target ? (
          <a key={key} href={target} className="text-oz-primary underline underline-offset-4">
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export interface MarkdownProps {
  source: string;
  /** Ignore la première citation (note de statut interne des textes provisoires). */
  skipLeadingQuote?: boolean;
  /** Route du site pour un lien de la source ; `undefined` : texte seul. */
  resolveHref: (href: string) => string | undefined;
}

export function Markdown({ source, skipLeadingQuote = false, resolveHref }: MarkdownProps) {
  let blocks = parseMarkdown(source);
  if (skipLeadingQuote) {
    const quote = blocks.findIndex((block) => block.kind === 'quote');
    if (quote !== -1 && blocks.slice(0, quote).every((block) => block.kind === 'heading')) {
      blocks = blocks.filter((_, index) => index !== quote);
    }
  }
  return (
    <div className="oz-prose flex flex-col gap-4">
      {blocks.map((block, index) => {
        const key = String(index);
        switch (block.kind) {
          case 'heading': {
            const Tag = (['h1', 'h2', 'h3'] as const)[block.level - 1] ?? 'h3';
            return (
              <Tag
                key={key}
                className={
                  block.level === 1
                    ? 'font-display text-3xl font-medium'
                    : block.level === 2
                      ? 'mt-4 font-display text-xl font-medium'
                      : 'font-medium'
                }
              >
                {inline(block.text, resolveHref)}
              </Tag>
            );
          }
          case 'quote':
            return (
              <blockquote key={key} className="border-l-2 border-oz-border pl-4 text-oz-text-muted">
                {inline(block.text, resolveHref)}
              </blockquote>
            );
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List
                key={key}
                className={`flex flex-col gap-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
              >
                {block.items.map((item, itemIndex) => (
                  <li key={String(itemIndex)}>{inline(item, resolveHref)}</li>
                ))}
              </List>
            );
          }
          case 'table':
            return (
              <div
                key={key}
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label={block.head.join(', ')}
              >
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th
                          key={String(cellIndex)}
                          scope="col"
                          className="border-b border-oz-border p-2 font-medium"
                        >
                          {inline(cell, resolveHref)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={String(rowIndex)}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={String(cellIndex)}
                            className="border-b border-oz-border p-2 align-top"
                          >
                            {inline(cell, resolveHref)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'paragraph':
            return <p key={key}>{inline(block.text, resolveHref)}</p>;
        }
      })}
    </div>
  );
}

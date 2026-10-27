import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export interface TableColumn<Row> {
  key: Extract<keyof Row, string>;
  /** En-tête déjà traduit. */
  header: string;
  /** Rendu de la cellule ; par défaut la valeur brute de `row[key]`. */
  render?: (row: Row) => ReactNode;
  align?: 'start' | 'end';
}

export interface TableProps<Row> {
  /** Légende obligatoire : nomme le tableau et sa zone de défilement pour les lecteurs d'écran. */
  caption: string;
  /** Légende masquée visuellement mais toujours annoncée. */
  hideCaption?: boolean;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  loading?: boolean;
  /** Message affiché quand `rows` est vide, déjà traduit. */
  emptyMessage?: string;
  'data-testid'?: string;
  className?: string;
}

const SKELETON_ROWS = 3;

/** Tableau de données sémantique ; défile horizontalement dans sa zone à 320 px. */
export function Table<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyMessage,
  'data-testid': testId,
  className,
}: TableProps<Row>) {
  const captionId = useId();
  const align = (column: TableColumn<Row>) => (column.align === 'end' ? 'text-right' : 'text-left');
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className={cn(
        'w-full overflow-x-auto rounded-[14px] border border-oz-border bg-oz-surface-2',
        'outline-[1.5px] outline-transparent outline-solid focus-visible:outline-oz-primary',
        className,
      )}
    >
      <table
        className="w-full min-w-max border-collapse text-sm text-oz-text"
        {...(testId ? { 'data-testid': testId } : {})}
        {...(loading ? { 'aria-busy': true } : {})}
      >
        <caption
          id={captionId}
          className={cn(
            'px-4 pt-4 pb-2 text-left text-base font-semibold',
            hideCaption && 'sr-only',
          )}
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-oz-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-3 text-xs font-semibold tracking-[0.08em] text-oz-text-label uppercase',
                  align(column),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={index} className="border-b border-oz-border last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <span className="block h-4 w-24 animate-pulse rounded bg-oz-surface-input motion-reduce:animate-none" />
                    </td>
                  ))}
                </tr>
              ))
            : null}
          {!loading && rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-oz-text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {!loading
            ? rows.map((row) => (
                <tr key={getRowKey(row)} className="border-b border-oz-border last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-4 py-3', align(column))}>
                      {column.render ? column.render(row) : (row[column.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}

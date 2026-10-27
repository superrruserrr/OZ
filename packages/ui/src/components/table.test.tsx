import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, type TableColumn } from './table.js';

interface Row {
  id: string;
  name: string;
  status: string;
}

const columns: readonly TableColumn<Row>[] = [
  { key: 'name', header: 'Nom' },
  { key: 'status', header: 'Statut' },
];
const rows: readonly Row[] = [
  { id: '1', name: 'Alpha', status: 'Actif' },
  { id: '2', name: 'Bêta', status: 'En attente' },
];

describe('Table', () => {
  it('tableau sémantique : légende, en-têtes de colonne avec scope, lignes', () => {
    render(
      <Table
        caption="Comptes"
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        data-testid="table-accounts"
      />,
    );
    const table = screen.getByRole('table', { name: 'Comptes' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((th) => th.getAttribute('scope'))).toEqual(['col', 'col']);
    expect(headers.map((th) => th.textContent)).toEqual(['Nom', 'Statut']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Bêta')).toBeTruthy();
    expect(screen.getByTestId('table-accounts')).toBe(table);
  });

  it('zone défilante horizontale nommée et atteignable au clavier (320 px)', () => {
    render(<Table caption="Comptes" columns={columns} rows={rows} getRowKey={(row) => row.id} />);
    const region = screen.getByRole('region', { name: 'Comptes' });
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain('overflow-x-auto');
  });

  it('chargement : lignes squelettes et aria-busy, aucune donnée affichée', () => {
    render(
      <Table caption="Comptes" columns={columns} rows={rows} getRowKey={(r) => r.id} loading />,
    );
    const table = screen.getByRole('table', { name: 'Comptes' });
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(within(table).queryByText('Alpha')).toBeNull();
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('vide : message reçu en prop sur toute la largeur', () => {
    render(
      <Table
        caption="Comptes"
        columns={columns}
        rows={[]}
        getRowKey={(r) => r.id}
        emptyMessage="Aucun compte pour l'instant."
      />,
    );
    const cell = screen.getByText("Aucun compte pour l'instant.");
    expect(cell.closest('td')?.getAttribute('colspan')).toBe('2');
  });
});

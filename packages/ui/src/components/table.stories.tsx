import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';
import { Table, type TableColumn } from './table.js';

interface Request {
  id: string;
  reference: string;
  kind: string;
  status: 'verified' | 'kyc' | 'danger';
  statusLabel: string;
  updatedAt: string;
}

// Données de démonstration : références fictives, aucune personne ni chiffre présentés comme réels.
const rows: readonly Request[] = [
  {
    id: '1',
    reference: 'DEMO-0001',
    kind: 'Identité',
    status: 'verified',
    statusLabel: 'Vérifié',
    updatedAt: '12/10/2026',
  },
  {
    id: '2',
    reference: 'DEMO-0002',
    kind: 'Autorisation du tuteur',
    status: 'kyc',
    statusLabel: 'En attente',
    updatedAt: '14/10/2026',
  },
  {
    id: '3',
    reference: 'DEMO-0003',
    kind: 'Identité',
    status: 'danger',
    statusLabel: 'Rejeté',
    updatedAt: '15/10/2026',
  },
];

const columns: readonly TableColumn<Request>[] = [
  { key: 'reference', header: 'Référence' },
  { key: 'kind', header: 'Demande' },
  {
    key: 'status',
    header: 'Statut',
    render: (row) => (
      <Badge tone={row.status} status={row.status}>
        {row.statusLabel}
      </Badge>
    ),
  },
  { key: 'updatedAt', header: 'Mise à jour', align: 'end' },
];

const meta = {
  title: 'Composants/Tableau',
  component: Table<Request>,
  args: { caption: 'Demandes de vérification', columns, rows, getRowKey: (row: Request) => row.id },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Tableau sémantique (`caption`, `th scope="col"`) ; défile horizontalement dans sa zone, focalisable au clavier, sans débordement de page à 320 px.',
      },
    },
  },
} satisfies Meta<typeof Table<Request>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Donnees: Story = { name: 'Données' };

export const Chargement: Story = { args: { loading: true } };

export const Vide: Story = {
  args: { rows: [], emptyMessage: 'Aucune demande pour le moment.' },
};

export const Ecran320: Story = {
  name: 'Écran 320 px',
  globals: { viewport: { value: 'small', isRotated: false } },
};

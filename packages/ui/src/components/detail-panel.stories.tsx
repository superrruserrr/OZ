import type { Meta, StoryObj } from '@storybook/react-vite';
import { DetailPanel } from './detail-panel.js';

/* Panneau de détail (lot 1.5dc) : section de fiche ouverte au clic, fermée par Échap ou la croix. */
const meta = {
  title: 'Workspace/Panneau de détail',
  component: DetailPanel,
  args: {
    open: true,
    onClose: () => undefined,
    title: 'Profil sportif',
    description: 'Postes et pied fort',
    closeLabel: 'Fermer',
    children: <p className="text-oz-text-muted">Défenseur central, pied gauche.</p>,
  },
} satisfies Meta<typeof DetailPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ouvert: Story = {};

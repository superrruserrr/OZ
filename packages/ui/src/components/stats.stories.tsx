import type { Meta, StoryObj } from '@storybook/react-vite';
import { PitchPositions, RingChart, Sparkline, StatTile } from './stats.js';

/* Briques de statistiques du thème « Workspace » (lot 1.5cc, ADR-012). Valeurs entre crochets (M5). */
const meta = {
  title: 'Workspace/Statistiques',
  component: StatTile,
  args: {
    label: 'Vues recruteurs',
    value: '[n]',
    delta: '[+n] cette saison',
    trend: [2, 3, 3, 5, 4, 6],
  },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatTile>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tuile: Story = {};
export const TuileBleue: Story = {
  name: 'Tuile bleue',
  args: { tone: 'highlight', delta: undefined },
};
export const Courbes: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Sparkline values={[1, 3, 2, 5, 4]} />
      <Sparkline values={[1, 3, 2, 5, 4]} tone="highlight" variant="line" />
      <Sparkline values={[4, 2, 3, 1, 2]} tone="kyc" variant="line" />
    </div>
  ),
};
export const Anneau: Story = {
  render: () => (
    <div className="w-96">
      <RingChart
        label="Répartition de l'effectif par équipe"
        segments={[
          { label: 'Équipe A', value: 32 },
          { label: 'Réserve', value: 46 },
          { label: 'Formation', value: 18 },
        ]}
        totalLabel="joueurs"
      />
    </div>
  ),
};
export const Terrain: Story = {
  render: () => (
    <div className="w-96">
      <PitchPositions
        title="Postes occupés"
        primary="CB"
        secondary={['RB', 'DM']}
        labels={{ primary: 'Défenseur central', secondary: ['Latéral droit', 'Milieu défensif'] }}
      />
    </div>
  ),
};

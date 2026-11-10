import type { Meta, StoryObj } from '@storybook/react-vite';
import { FloatingChip, GlassPanel, Halo, PitchCircles } from './emotion.js';
import { OzIdCard } from './oz-id-card.js';

const meta = {
  title: 'Effets/Émotion',
  component: Halo,
  args: {
    children: (
      <OzIdCard
        name="Junior Mbarga"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        details={['Milieu', 'Cameroun']}
        reveal
      />
    ),
  },
  parameters: {
    docs: {
      description: {
        component:
          'Registre Émotion seulement (site public, carte OZ ID). E1 halo, E2 révélation de l’OZ ID, E16 cercles du terrain, E18 verre dépoli (repli opaque), E20 puces pays. Coupés avec mouvement réduit.',
      },
    },
  },
} satisfies Meta<typeof Halo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HaloEtRevelation: Story = { name: 'Halo et révélation (E1, E2)' };
export const Terrain: Story = {
  name: 'Cercles du terrain (E16)',
  render: () => <PitchCircles className="size-64" />,
};
export const Verre: Story = {
  name: 'Verre dépoli (E18)',
  render: () => (
    <div className="bg-oz-primary p-8">
      <GlassPanel>
        <p className="font-semibold">Pourquoi OZ est différent</p>
        <p className="text-sm text-oz-text-muted">Une identité vérifiée, à vie.</p>
      </GlassPanel>
    </div>
  ),
};
export const Puces: Story = {
  name: 'Puces pays (E20)',
  render: () => (
    <div className="flex gap-2">
      {['Cameroun', 'Sénégal', 'Côte d’Ivoire'].map((country, index) => (
        <FloatingChip key={country} index={index}>
          {country}
        </FloatingChip>
      ))}
    </div>
  ),
};

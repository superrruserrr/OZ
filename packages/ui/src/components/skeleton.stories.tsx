import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';
import { MeasureBar } from './measure-bar.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';

const meta = {
  title: 'Composants/Chargement et mesures',
  component: SkeletonGroup,
  args: {
    label: 'Chargement des résultats',
    children: (
      <>
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'E14 : squelettes à balayage lent, préférés au spinner en 3G. E12 : barres de mesures brutes (jamais de note). E13 : tampon du badge après confirmation serveur seulement.',
      },
    },
  },
} satisfies Meta<typeof SkeletonGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Squelettes: Story = {};
export const Mesures: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <MeasureBar label="Taille" value={178} max={210} unit="cm" />
      <MeasureBar label="Poids" value={71} max={120} unit="kg" index={1} />
      <MeasureBar label="Sprint 30 m" value={4.3} max={6} unit="s" index={2} />
    </div>
  ),
};
export const BadgeTampon: Story = {
  name: 'Badge tampon (après confirmation)',
  render: () => (
    <Badge tone="verified" confirmed animate>
      Profil vérifié
    </Badge>
  ),
};

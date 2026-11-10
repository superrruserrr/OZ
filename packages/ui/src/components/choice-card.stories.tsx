import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ChoiceCardGroup, type ChoiceOption } from './choice-card.js';
import { IconTile } from './icon-tile.js';

const person = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
  </svg>
);

const OPTIONS: ChoiceOption[] = [
  { value: 'player', title: 'Joueur', description: 'Je crée mon OZ ID', icon: person },
  {
    value: 'guardian',
    title: 'Tuteur légal',
    description: 'Je protège un joueur mineur',
    icon: person,
  },
  { value: 'club', title: 'Club', description: 'Bientôt disponible', icon: person, disabled: true },
];

function Demo({ initial }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ChoiceCardGroup
      label="Type de compte"
      testId="role-card"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

const meta = {
  title: 'Composants/Cartes de choix',
  component: Demo,
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
          'Écran 02 : groupe radio, un arrêt de tabulation, flèches pour choisir. E9 : contour vert et pastille cochée en « pop » (statique avec mouvement réduit).',
      },
    },
  },
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Repos: Story = {};
export const Selection: Story = { name: 'Sélection', args: { initial: 'player' } };
export const Clavier: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByTestId('role-card-guardian')).toHaveAttribute('aria-checked', 'true');
  },
};
export const Tuiles: Story = {
  name: 'Tuiles d’icône',
  render: () => (
    <div className="flex gap-3">
      <IconTile size="sm">{person}</IconTile>
      <IconTile>{person}</IconTile>
      <IconTile size="lg">{person}</IconTile>
    </div>
  ),
};

import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Select } from './select.js';

const options = [
  { value: 'goalkeeper', label: 'Gardien' },
  { value: 'defender', label: 'Défenseur' },
  { value: 'midfielder', label: 'Milieu' },
  { value: 'forward', label: 'Attaquant' },
  { value: 'staff', label: 'Encadrement (bientôt)', disabled: true },
];

const meta = {
  title: 'Composants/Sélecteur',
  component: Select,
  args: {
    id: 'position',
    label: 'Poste',
    placeholder: 'Choisir un poste',
    options,
    onValueChange: fn(),
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
          'Liste de choix (Radix Select) habillée comme le champ : clavier complet (flèches, Entrée, Échap), option cochée, options désactivées.',
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Repos: Story = {};

export const Selectionne: Story = { name: 'Sélectionné', args: { defaultValue: 'midfielder' } };

export const Clavier: Story = {
  play: async ({ args, canvasElement }) => {
    const trigger = within(canvasElement).getByRole('combobox', { name: 'Poste' });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const listbox = await within(document.body).findByRole('listbox');
    await expect(listbox).toBeVisible();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('defender');
    await userEvent.keyboard('{Enter}');
    await within(document.body).findByRole('listbox');
    await userEvent.keyboard('{Escape}');
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
    await expect(trigger).toHaveFocus();
  },
};

export const Erreur: Story = { args: { error: 'Choisissez un poste.' } };

export const Desactive: Story = { name: 'Désactivé', args: { disabled: true } };

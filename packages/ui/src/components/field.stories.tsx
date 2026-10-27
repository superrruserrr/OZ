import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Field } from './field.js';

const meta = {
  title: 'Composants/Champ',
  component: Field,
  args: { id: 'first-name', label: 'Prénom', placeholder: 'Votre prénom' },
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
          'Champ de saisie : libellé majuscule relié, aide, méta-information à droite, erreur annoncée. E5 : contour vert de 1,5 px en 150 ms au focus.',
      },
    },
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Repos: Story = {};

export const AvecAide: Story = {
  name: 'Avec aide et méta-information',
  args: {
    id: 'birth-date',
    label: 'Date de naissance',
    type: 'date',
    hint: 'Elle détermine les autorisations nécessaires.',
    meta: '24 ans',
    placeholder: undefined,
  },
};

export const Focus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByLabelText('Prénom')).toHaveFocus();
  },
};

export const Erreur: Story = {
  args: { error: 'Indiquez votre prénom.' },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Prénom');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription('Indiquez votre prénom.');
  },
};

export const Desactive: Story = {
  name: 'Désactivé',
  args: { id: 'oz-id', label: 'OZ ID', disabled: true, defaultValue: 'OZ-CM-26-7K4M9Q-3' },
};

export const Chargement: Story = {
  args: {
    id: 'email',
    label: 'E-mail',
    type: 'email',
    loading: true,
    defaultValue: 'demo@example.test',
  },
};

export const MouvementsReduits: Story = {
  name: 'Mouvements réduits',
  parameters: {
    docs: {
      description: {
        story:
          'Sous `prefers-reduced-motion: reduce`, le contour de focus apparaît sans transition (repli « contour seul » de E5) ; vérifié par `test:stories`.',
      },
    },
  },
};

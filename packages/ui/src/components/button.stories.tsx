import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button } from './button.js';

const meta = {
  title: 'Composants/Bouton',
  component: Button,
  args: { children: 'Continuer', onClick: fn() },
  argTypes: {
    variant: { control: 'inline-radio', options: ['primary', 'secondary'] },
    size: { control: 'inline-radio', options: ['md', 'sm'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Action principale ou secondaire. Le vert ne s'allume que lorsque l'action est possible (design.md §8.4 n° 1) ; E3 au survol et à l'appui, E4 à l'activation.",
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Principal: Story = {};

export const Secondaire: Story = { args: { variant: 'secondary', children: 'Retour' } };

export const Focus: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole('button')).toHaveFocus();
  },
};

export const Desactive: Story = {
  name: 'Désactivé',
  args: { disabled: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Continuer' });
    await expect(button).toBeDisabled();
    await userEvent.click(button, { pointerEventsCheck: 0 });
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Chargement: Story = {
  args: { loading: true, children: 'Envoi en cours' },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Envoi en cours' });
    await expect(button).toHaveAttribute('aria-busy', 'true');
  },
};

export const CommeLien: Story = {
  name: 'Comme lien (asChild)',
  args: { asChild: true, children: <a href="#inscription">Créer mon compte</a> },
};

export const MouvementsReduits: Story = {
  name: 'Mouvements réduits',
  parameters: {
    docs: {
      description: {
        story:
          "Sous `prefers-reduced-motion: reduce`, ni ombre ni mise à l'échelle et aucune transition : le bouton passe directement à son état final. Activer l'émulation dans les outils du navigateur (Rendu → prefers-reduced-motion) ; le test `test:stories` la vérifie automatiquement.",
      },
    },
  },
};

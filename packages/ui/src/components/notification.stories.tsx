import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { Notification, NotificationProvider } from './notification.js';

const meta = {
  title: 'Composants/Notification',
  component: Notification,
  args: {
    open: true,
    onOpenChange: fn(),
    tone: 'success',
    title: 'Profil enregistré',
    description: 'Vos modifications sont visibles.',
    closeLabel: 'Fermer la notification',
    // Reste affichée pendant la consultation de la story.
    duration: Number.POSITIVE_INFINITY,
  },
  argTypes: { tone: { control: 'inline-radio', options: ['success', 'info', 'error'] } },
  decorators: [
    (Story) => (
      <NotificationProvider label="Notifications">
        <Story />
      </NotificationProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Notification (Radix Toast) : une erreur est annoncée immédiatement (`aria-live` assertive), un succès ou une information sans interrompre (polite). Fermeture au bouton, au balayage ou à l'échéance.",
      },
      story: { inline: false, height: '200px' },
    },
  },
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return <Notification {...args} open={open} onOpenChange={setOpen} />;
  },
} satisfies Meta<typeof Notification>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Succes: Story = { name: 'Succès' };

export const Information: Story = {
  args: {
    tone: 'info',
    title: 'Autorisation envoyée',
    description: 'Le tuteur a reçu le lien par e-mail.',
  },
};

export const Erreur: Story = {
  args: {
    tone: 'error',
    title: "La pièce n'a pas pu être lue",
    description: 'Reprenez la photo en pleine lumière.',
  },
};

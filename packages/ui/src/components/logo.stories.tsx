import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Logo } from './logo.js';

const meta = {
  title: 'Composants/Logo',
  component: Logo,
  args: { alt: 'OZ Football ID' },
  parameters: {
    docs: {
      description: {
        component:
          'Logo de la charte (ADR-009) : horizontal au-dessus de 640 px, empilé en dessous ; version fond sombre selon le réglage de l’appareil. Changer le viewport pour voir la version mobile.',
      },
    },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaut: Story = {
  play: async ({ canvasElement }) => {
    const img = within(canvasElement).getByRole('img', { name: 'OZ Football ID' });
    await expect(img).toBeVisible();
  },
};

export const Mobile: Story = { globals: { viewport: { value: 'small' } } };

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { Badge } from './badge.js';
import { Card } from './card.js';

const meta = {
  title: 'Composants/Carte',
  component: Card,
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
          'Surface `surface-2`, rayon 14 px. Variante `interactive` : bouton à bascule, sélection annoncée par `aria-pressed`, contour vert et pastille cochée (E9).',
      },
    },
  },
} satisfies Meta;

export default meta;
// Props en union discriminée (statique ou interactive) : les stories passent par `render`.
type Story = StoryObj;

export const Statique: Story = {
  render: () => (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="font-semibold">Vérification d'identité</p>
        <p className="text-sm text-oz-text-muted">Une pièce d'identité et un selfie suffisent.</p>
      </div>
    </Card>
  ),
};

function RoleChoice({ disabled = false }: { disabled?: boolean }) {
  const [role, setRole] = useState<string | null>(null);
  const roles = [
    { value: 'player', title: 'Joueur', detail: 'Mon profil sportif vérifié' },
    { value: 'scout', title: 'Recruteur', detail: 'Rechercher des profils certifiés' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {roles.map((item) => (
        <Card
          key={item.value}
          interactive
          disabled={disabled}
          selected={role === item.value}
          onSelect={() => {
            setRole(item.value);
          }}
          data-testid={`card-role-${item.value}`}
        >
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{item.title}</span>
            <span className="text-sm text-oz-text-muted">{item.detail}</span>
            {item.value === 'scout' ? (
              <span className="mt-2">
                <Badge tone="kyc" status="kyc-required">
                  KYC 3 exigé
                </Badge>
              </span>
            ) : null}
          </span>
        </Card>
      ))}
    </div>
  );
}

export const Interactive: Story = {
  render: () => <RoleChoice />,
};

export const Selectionnee: Story = {
  name: 'Sélectionnée (clavier)',
  render: () => <RoleChoice />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByTestId('card-role-player')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByTestId('card-role-scout')).toHaveAttribute('aria-pressed', 'false');
  },
};

export const Desactivee: Story = { name: 'Désactivée', render: () => <RoleChoice disabled /> };

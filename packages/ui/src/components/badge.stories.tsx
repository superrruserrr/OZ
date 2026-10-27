import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';

const meta = {
  title: 'Composants/Badge',
  component: Badge,
  args: { tone: 'verified', children: 'Vérifié' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['verified', 'kyc', 'legal', 'danger', 'neutral'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Statut sémantique : vert = vérifié (après confirmation serveur, CP-19), ambre = niveau KYC, bleu = cadre légal et tuteur, rouge = bloquant ou danger uniquement (design.md §8.4).',
      },
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Verifie: Story = { name: 'Vérifié' };
export const NiveauKyc: Story = {
  name: 'Niveau KYC',
  args: { tone: 'kyc', status: 'kyc-required', children: 'KYC 3 exigé' },
};
export const Legal: Story = {
  name: 'Légal',
  args: { tone: 'legal', status: 'guardian', children: 'Tuteur requis' },
};
export const Danger: Story = {
  args: { tone: 'danger', status: 'blocking', children: 'Étape bloquante' },
};
export const Neutre: Story = { args: { tone: 'neutral', status: 'draft', children: 'Brouillon' } };

export const Tous: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge tone="verified">Vérifié</Badge>
      <Badge tone="kyc" status="kyc-progress">
        KYC 1/3
      </Badge>
      <Badge tone="legal" status="guardian">
        Tuteur requis
      </Badge>
      <Badge tone="danger" status="rejected">
        Rejeté
      </Badge>
      <Badge tone="neutral" status="draft">
        Brouillon
      </Badge>
    </div>
  ),
};

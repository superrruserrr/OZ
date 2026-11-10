import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from './button.js';
import { Callout } from './callout.js';
import { CheckList } from './check-list.js';

const info = (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="10" cy="10" r="8" />
    <path d="M10 9v5M10 6.5v.01" strokeLinecap="round" />
  </svg>
);

const meta = {
  title: 'Composants/Encadré',
  component: Callout,
  args: { children: 'Le niveau KYC 2 est exigé avant de publier le profil.', icon: info },
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
          'Encadré d’information ; ton légal en bleu pour tout ce qui relève du tuteur (§8.4). E6 : dépliage en 250 ms, direct avec mouvement réduit.',
      },
    },
  },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Information: Story = {};
export const Legal: Story = {
  name: 'Légal, avec liste à coches',
  args: {
    tone: 'legal',
    title: 'Votre tuteur contrôlera',
    children: (
      <CheckList
        className="mt-2 text-oz-legal-text"
        items={[
          'La publication et la visibilité du profil',
          'Le journal des consultations',
          'Toute prise de contact, jamais directe',
          'Le retrait du consentement',
        ]}
      />
    ),
  },
};

function Unfold() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        Date de naissance : 17 ans
      </Button>
      <Callout tone="legal" live open={open} testId="minor-callout" icon={info}>
        <strong>Joueur mineur :</strong> un tuteur légal vérifié doit valider l’inscription.
      </Callout>
    </div>
  );
}
export const Depliable: Story = { name: 'Dépliable (bloc mineur)', render: () => <Unfold /> };

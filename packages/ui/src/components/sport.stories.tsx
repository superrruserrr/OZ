import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';
import { Button } from './button.js';
import { Kicker, SplitHeading } from './sport.js';

const meta = {
  title: 'Direction sport/Primitives',
  component: SplitHeading,
  args: { as: 'h1', lead: 'Ton talent,', highlight: 'notre mission.', size: 'hero' },
  parameters: {
    docs: {
      description: {
        component:
          'Primitives de la direction « sport » (lot 1.5ca, ADR-011), d’après la maquette Manus aux couleurs de la charte : libellé à puce, titre scindé (fin en rose, grand texte seulement), pilules remplies, bouton à halo vert et bouton contour.',
      },
    },
  },
} satisfies Meta<typeof SplitHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitreHeros: Story = { name: 'Titre de héros', args: { breakBeforeHighlight: true } };
export const TitreSection: Story = {
  name: 'Titre de section',
  args: { as: 'h2', size: 'section', lead: 'Du premier match', highlight: 'au prochain contrat.' },
};

const Arrow = () => (
  <svg data-arrow="" viewBox="0 0 16 16" className="size-4" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

export const Ensemble: Story = {
  render: () => (
    <div className="flex max-w-2xl flex-col gap-6">
      <Kicker>Identité football vérifiée</Kicker>
      <SplitHeading
        as="h1"
        size="hero"
        lead="Ton talent,"
        highlight="notre mission."
        breakBeforeHighlight
      />
      <div className="flex flex-wrap gap-2">
        <Badge tone="verified" filled>
          Profil vérifié
        </Badge>
        <Badge tone="kyc" filled>
          KYC 3 exigé
        </Badge>
        <Badge tone="neutral" filled>
          Bientôt
        </Badge>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button glow>
          Créer mon compte <Arrow />
        </Button>
        <Button variant="outline">Voir les tarifs</Button>
        <Button glow disabled>
          Inactif, sans halo
        </Button>
      </div>
      <Kicker tone="highlight">Réseau</Kicker>
    </div>
  ),
};

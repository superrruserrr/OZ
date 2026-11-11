import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge.js';
import { Button } from './button.js';
import { LivePanel } from './live-panel.js';
import { Kicker, SplitHeading } from './sport.js';
import { StadiumHero } from './stadium-hero.js';

const Arrow = () => (
  <svg data-arrow="" viewBox="0 0 16 16" className="size-4" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

const copy = (
  <div className="flex max-w-xl flex-col items-start gap-5">
    <Kicker>Identité football vérifiée</Kicker>
    <SplitHeading
      as="h1"
      size="hero"
      lead="Ton talent,"
      highlight="notre mission."
      breakBeforeHighlight
    />
    <p className="max-w-lg text-base leading-relaxed text-oz-text-muted sm:text-lg">
      OZ donne à chaque joueur une identité numérique vérifiée, protège les mineurs et met les
      talents en relation avec des recruteurs de confiance.
    </p>
    <div className="flex flex-wrap gap-3">
      <Button glow>
        Créer mon compte <Arrow />
      </Button>
      <Button variant="outline">Voir les tarifs</Button>
    </div>
    <div className="flex flex-wrap gap-2">
      <Badge tone="verified" filled>
        Joueurs vérifiés
      </Badge>
      <Badge tone="neutral" filled>
        Organisations officielles
      </Badge>
    </div>
  </div>
);

const aside = (
  <LivePanel
    status="Inscriptions bientôt ouvertes"
    title="Chaque profil,"
    highlight="plus de preuves."
    facts={[
      { label: 'Identité', value: 'Vérifiée' },
      { label: 'Mineurs', value: 'Protégés' },
      { label: 'Contact', value: 'Encadré' },
    ]}
  >
    Identité vérifiée, vidéos courtes et mesures certifiées : de quoi décider sans promesse.
  </LivePanel>
);

const meta = {
  title: 'Direction sport/Héros de stade',
  component: StadiumHero,
  args: { copy, aside },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Héros « nuit de stade » (lot 1.5ca, ADR-011) d’après la maquette Manus : décor CSS et SVG sans photo (D-129), voile de lisibilité, panneau vitré « en direct » qui passe sous le texte avant 1024 px. Aucun chiffre fictif (M5), aucun joueur identifiable (EX-T16).',
      },
    },
  },
} satisfies Meta<typeof StadiumHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AvecPanneau: Story = { name: 'Avec panneau' };
export const SansPanneau: Story = { name: 'Sans panneau', args: { aside: undefined } };
export const Panneau: Story = {
  name: 'Panneau seul',
  render: () => <div className="max-w-sm p-6">{aside}</div>,
};

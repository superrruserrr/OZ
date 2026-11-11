import type { Meta, StoryObj } from '@storybook/react-vite';
import { MeasureBar } from './measure-bar.js';
import { RoleCard } from './role-card.js';
import { Kicker, SplitHeading } from './sport.js';
import { ValueCard } from './value-card.js';

const Shield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const meta = {
  title: 'Direction sport/Cartes et bandeaux',
  component: ValueCard,
  args: {
    href: '#',
    title: 'Identité vérifiée',
    cta: 'Découvrir',
    children: 'Un OZ ID unique par joueur, adossé à une vérification d’identité progressive.',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Cartes de valeur et de rôle (lot 1.5ca) d’après les bandeaux de la maquette Manus : une carte = un lien, nommé par son titre. Les barres illustrent des critères, jamais un score de joueur (Q18).',
      },
    },
  },
} satisfies Meta<typeof ValueCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Valeur: Story = { args: { icon: <Shield /> } };

export const BandeauValeurs: Story = {
  name: 'Bandeau de valeurs',
  render: () => (
    <div className="flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Kicker>Pour tout le football</Kicker>
        <SplitHeading lead="Du premier match" highlight="au prochain contrat." />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ValueCard href="#" title="Identité vérifiée" cta="Découvrir" icon={<Shield />}>
          Un OZ ID unique par joueur, adossé à une vérification progressive.
        </ValueCard>
        <ValueCard href="#" title="Mineurs protégés" cta="Comprendre" icon={<Shield />}>
          Le tuteur décide de la visibilité du profil et de chaque prise de contact.
        </ValueCard>
        <ValueCard href="#" title="Mise en relation" cta="Voir les tarifs" icon={<Shield />}>
          Seules des organisations vérifiées consultent les profils, selon leurs droits.
        </ValueCard>
      </div>
    </div>
  ),
};

export const PanneauRoles: Story = {
  name: 'Panneau de rôles',
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <RoleCard href="#" title="Je suis joueur" subtitle="Créer mon OZ ID vérifié" />
      <RoleCard
        href="#"
        tone="organization"
        title="Je représente un club"
        subtitle="Montrer notre filière"
      />
      <RoleCard
        href="#"
        tone="recruiter"
        title="Je suis recruteur"
        subtitle="Trouver des profils vérifiés"
      />
      <RoleCard
        href="#"
        tone="guardian"
        title="Je suis tuteur"
        subtitle="Protéger le profil de mon enfant"
      />
    </div>
  ),
};

export const BarresCriteres: Story = {
  name: 'Barres de critères au défilement',
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <MeasureBar label="Identité vérifiée" value={3} max={3} valueText="3 niveaux" animateOnView />
      <MeasureBar
        label="Pièces contrôlées"
        value={2}
        max={3}
        valueText="2 sur 3"
        index={1}
        animateOnView
      />
      <MeasureBar
        label="Consentement tuteur"
        value={1}
        max={1}
        valueText="Requis"
        index={2}
        animateOnView
      />
    </div>
  ),
};

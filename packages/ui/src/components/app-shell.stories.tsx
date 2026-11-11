import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './app-shell.js';
import { AdSlot, MediaFrame } from './media-frame.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';
import { RingChart, StatTile } from './stats.js';
import type { TabItem } from './tab-bar.js';

const icon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <circle cx="12" cy="12" r="8" />
  </svg>
);
const PLAYER: TabItem[] = [
  { id: 'home', label: 'Accueil', href: '#accueil', icon },
  { id: 'search', label: 'Recherche', href: '#recherche', icon },
  { id: 'messages', label: 'Messages', href: '#messages', icon, count: 2 },
  { id: 'profile', label: 'Profil', href: '#profil', icon },
  { id: 'more', label: 'Plus', href: '#plus', icon },
];

const meta = {
  title: 'Coquille/Application',
  component: AppShell,
  args: {
    skipLabel: 'Aller au contenu',
    header: <span className="font-bold">OZ Football ID</span>,
    nav: {
      label: 'Navigation principale',
      items: PLAYER,
      activeId: 'home',
      countLabel: (n: number) => `${String(n)} non lus`,
    },
    children: (
      <SkeletonGroup label="Chargement">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </SkeletonGroup>
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Coquille (§8.8) : barre d’onglets en bas sur téléphone, rail latéral à partir de 1024 px. Les droits restent appliqués par le serveur.',
      },
    },
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Joueur: Story = {};
export const SansNavigation: Story = {
  name: 'Sans navigation (inscription)',
  args: { nav: undefined },
};

/** Coquille v2 (lot 1.5ca) : rail à sections, fil d'Ariane, pied de rail. */
export const JoueurV2: Story = {
  name: 'Joueur, coquille v2',
  args: {
    breadcrumb: (
      <span>
        Espace joueur › <b className="text-oz-text">Accueil</b>
      </span>
    ),
    nav: {
      label: 'Navigation principale',
      sectionLabel: 'Pilotage',
      items: PLAYER,
      activeId: 'home',
      countLabel: (n: number) => `${String(n)} non lus`,
      secondary: {
        label: 'Réseau',
        items: [
          { id: 'settings', label: 'Réglages', href: '#reglages', icon },
          { id: 'help', label: 'Aide', href: '#aide', icon },
        ],
      },
    },
    railFooter: (
      <div className="flex items-center gap-3 px-3 text-sm">
        <span className="grid size-9 place-items-center rounded-full bg-oz-tint-green font-medium text-oz-primary">
          JM
        </span>
        <span className="min-w-0">
          <b className="block truncate">Joueur</b>
          <small className="text-oz-text-muted">Profil en cours</small>
        </span>
      </div>
    ),
  },
};

/** Thème « Workspace » (lot 1.5cc, ADR-012) : en-tête de rail, tuiles chiffrées, cadres. */
export const Workspace: Story = {
  name: 'Workspace (noir et lime)',
  args: {
    ...JoueurV2.args,
    railHeader: (
      <p className="text-base font-medium text-oz-text">
        OZ <span className="text-oz-text-muted">Workspace</span>
      </p>
    ),
    children: (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Vues recruteurs"
            value="[n]"
            delta="[+n] cette saison"
            trend={[2, 3, 3, 5, 4, 6]}
          />
          <StatTile label="Matchs joués" value="[n]" trend={[1, 2, 2, 3]} tone="highlight" />
          <StatTile label="Documents vérifiés" value="[n]" tone="kyc" trend={[1, 1, 2, 3]} />
          <StatTile label="Messages" value="[n]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-oz-border bg-oz-surface-1 p-5">
            <RingChart
              label="Répartition de l'effectif par équipe"
              segments={[
                { label: 'Équipe A', value: 32 },
                { label: 'Réserve', value: 46 },
                { label: 'Formation', value: 18 },
              ]}
              totalLabel="joueurs"
            />
          </div>
          <MediaFrame
            ratio="4:5"
            tag="N° [n]"
            overlay={<p className="font-medium">[Prénom Nom]</p>}
          />
        </div>
        <AdSlot format="leaderboard" sponsoredLabel="Sponsorisé" placeholder="Espace partenaire" />
      </div>
    ),
  },
};

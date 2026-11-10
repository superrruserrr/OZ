import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './app-shell.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';
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

import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { DotPagination } from './dot-pagination.js';
import { FilterChip } from './filter-chip.js';
import { TabBar, type TabItem } from './tab-bar.js';

function Chips() {
  const [active, setActive] = useState<string[]>(['mf']);
  const toggle = (id: string) => {
    setActive((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ['gk', 'Gardien'],
        ['df', 'Défenseur'],
        ['mf', 'Milieu'],
        ['fw', 'Attaquant'],
      ].map(([id = '', label = '']) => (
        <FilterChip
          key={id}
          testId={`filter-position-${id}`}
          pressed={active.includes(id)}
          onPressedChange={() => {
            toggle(id);
          }}
          onRemove={() => {
            toggle(id);
          }}
          removeLabel={`Retirer ${label}`}
        >
          {label}
        </FilterChip>
      ))}
    </div>
  );
}

const icon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M4 11l8-7 8 7v9H4z" strokeLinejoin="round" />
  </svg>
);
const TABS: TabItem[] = [
  { id: 'home', label: 'Accueil', href: '#accueil', icon },
  { id: 'search', label: 'Recherche', href: '#recherche', icon },
  { id: 'messages', label: 'Messages', href: '#messages', icon, count: 3 },
  { id: 'profile', label: 'Profil', href: '#profil', icon },
  { id: 'more', label: 'Plus', href: '#plus', icon },
];

function Dots() {
  const [index, setIndex] = useState(0);
  return (
    <DotPagination
      testId="splash-dot"
      count={4}
      index={index}
      label={(n, total) => `Volet ${String(n)} sur ${String(total)}`}
      onSelect={setIndex}
    />
  );
}

const meta = {
  title: 'Composants/Navigation et filtres',
  component: Chips,
  parameters: {
    docs: {
      description: {
        component:
          'Puces de filtre (bascule, « × » pour retirer), barre d’onglets (5 au plus, actif en vert, pastille de compteur) et pagination à points (E15).',
      },
    },
  },
} satisfies Meta<typeof Chips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Puces: Story = {};
export const Onglets: Story = {
  render: () => (
    <div className="w-80">
      <TabBar
        label="Navigation principale"
        items={TABS}
        activeId="search"
        countLabel={(n) => `${String(n)} non lus`}
      />
    </div>
  ),
};
export const Points: Story = { render: () => <Dots /> };

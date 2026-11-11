import type { Meta, StoryObj } from '@storybook/react-vite';
import { contrastRatio } from './contrast.js';
import { ozThemes, type OzColor, type OzMode } from './tokens.js';

function Swatches({ mode }: { mode: OzMode }) {
  const ozColors = ozThemes[mode];
  const names = Object.keys(ozColors) as OzColor[];
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
      {names.map((name) => {
        const ratio = contrastRatio(ozColors[name], ozColors.bg);
        return (
          <li
            key={name}
            className="overflow-hidden rounded-[14px] border border-oz-border bg-oz-surface-2"
          >
            <span
              aria-hidden="true"
              className="block h-16"
              style={{ backgroundColor: ozColors[name] }}
            />
            <span className="flex flex-col gap-1 p-3 text-sm">
              <span className="font-mono text-oz-text">--oz-{name}</span>
              <span className="font-mono text-oz-text-muted">{ozColors[name]}</span>
              <span className="text-oz-text-muted">
                Contraste sur bg : {ratio.toFixed(1)}
                {ratio >= 4.5 ? ' · AA' : ''}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const meta = {
  title: 'Fondations/Jetons de couleur',
  component: Swatches,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Jetons de design.md §8.3, source unique `tokens.ts`, posés en variables `--oz-*` par `styles/tokens.css`. Deux jeux (clair, sombre), contraste calculé sur le fond `bg` du mode. Depuis ADR-011, le web ne sert que le jeu sombre ; le clair reste pour le mobile et l’impression.',
      },
    },
  },
} satisfies Meta<typeof Swatches>;

export default meta;

export const Clair: StoryObj<typeof meta> = {
  name: 'Clair (mobile, impression)',
  args: { mode: 'light' },
};

export const Sombre: StoryObj<typeof meta> = {
  name: 'Sombre (web, ADR-011)',
  args: { mode: 'dark' },
};

/** Correspondance des couleurs de la maquette Manus vers la charte (lot 1.5ca, ADR-011). */
const MOCKUP_MAP: readonly [string, string, OzColor][] = [
  ['Lime (actions, vérifié)', 'Vert d’action', 'primary'],
  ['Lime des mots d’accroche', 'Rose, grand texte seulement', 'accent'],
  ['Bleu', 'Turquoise, pictos et mises en avant', 'highlight'],
  ['Ambre', 'Niveau KYC', 'kyc'],
  ['Rouge', 'Bloquant, danger', 'danger'],
  ['Fond', 'Fond', 'bg'],
  ['Cartes', 'Surface', 'surface-1'],
];

export const CorrespondanceMaquette: StoryObj<typeof meta> = {
  name: 'Maquette → charte',
  args: { mode: 'dark' },
  render: () => (
    <table className="text-sm">
      <caption className="mb-3 text-left font-semibold">
        Maquette Manus → jetons de la charte
      </caption>
      <thead>
        <tr className="text-left text-oz-text-label">
          <th className="pr-6 pb-2">Maquette</th>
          <th className="pr-6 pb-2">Rôle dans la charte</th>
          <th className="pb-2">Jeton</th>
        </tr>
      </thead>
      <tbody>
        {MOCKUP_MAP.map(([mockup, role, token]) => (
          <tr key={token + mockup} className="border-t border-oz-border">
            <td className="py-2 pr-6">{mockup}</td>
            <td className="py-2 pr-6">{role}</td>
            <td className="py-2 font-mono">
              {token} · {ozThemes.dark[token]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
};

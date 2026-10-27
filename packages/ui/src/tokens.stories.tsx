import type { Meta, StoryObj } from '@storybook/react-vite';
import { contrastRatio } from './contrast.js';
import { ozColors, type OzColor } from './tokens.js';

function Swatches() {
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
          'Jetons de design.md §8.3, source unique `tokens.ts`, posés en variables `--oz-*` par `styles/tokens.css`. Contraste calculé sur le fond `bg`.',
      },
    },
  },
} satisfies Meta<typeof Swatches>;

export default meta;

export const Nuancier: StoryObj<typeof meta> = {};

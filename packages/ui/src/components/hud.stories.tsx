import type { Meta, StoryObj } from '@storybook/react-vite';
import { AttributeRadar } from './attribute-radar.js';
import { GaugeDial } from './gauge-dial.js';
import { HudFrame } from './hud-frame.js';
import { MeasureBar } from './measure-bar.js';

/*
 * Statistiques façon jeu de football (lot 1.5eb, E4). Valeurs entre crochets (M5) : le dessin montre
 * la forme, jamais un chiffre présenté comme réel. Dans l'application, seules les données réelles
 * remplissent l'hexagone ; les aptitudes restent vides tant qu'aucune mesure certifiée n'existe.
 */
const AXES = [
  '[Rubrique A]',
  '[Rubrique B]',
  '[Rubrique C]',
  '[Rubrique D]',
  '[Rubrique E]',
  '[Rubrique F]',
];

const meta = {
  title: 'Workspace/Statistiques façon jeu',
  component: HudFrame,
  args: { title: '[Titre]', kicker: '[Sur-titre]', illustration: 'pitch', children: null },
} satisfies Meta<typeof HudFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hexagone: Story = {
  args: {
    children: (
      <AttributeRadar
        label="[Complétude du profil]"
        axes={AXES.map((label, index) => ({
          key: label,
          label,
          value: [100, 75, 50, 100, 25, 75][index] ?? 0,
          valueText: '[n] %',
        }))}
      />
    ),
  },
};

export const HexagoneVide: Story = {
  name: 'Hexagone vide',
  args: {
    illustration: 'hex',
    children: (
      <AttributeRadar
        label="[Aptitudes]"
        emptyText="[En attente de mesures certifiées]"
        axes={AXES.map((label) => ({ key: label, label, value: null }))}
      />
    ),
  },
};

export const Jauges: Story = {
  args: {
    illustration: 'none',
    children: (
      <div className="grid grid-cols-2 gap-4">
        <GaugeDial label="[Jauge]" value={60} valueText="[n] %" />
        <GaugeDial label="[Jauge vide]" value={null} emptyText="[Bientôt disponible]" />
      </div>
    ),
  },
};

export const BarresSegmentees: Story = {
  name: 'Barres segmentées',
  args: {
    illustration: 'none',
    children: (
      <div className="flex flex-col gap-3">
        <MeasureBar label="[Mesure A]" value={7} max={10} valueText="[n]" segmented />
        <MeasureBar label="[Mesure B]" value={4} max={10} valueText="[n]" segmented index={1} />
      </div>
    ),
  },
};

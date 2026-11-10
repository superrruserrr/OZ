import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FloatingChip } from './emotion.js';
import { MeasureBar } from './measure-bar.js';
import { OzIdCard } from './oz-id-card.js';
import { StepProgress } from './step-progress.js';

// La CSP des applications bloque les attributs `style` du HTML serveur (lot 1.6) : les valeurs
// calculées passent par le CSSOM après montage (`cssomStyle`).
describe('HTML serveur sans attribut style (CSP, lot 1.6)', () => {
  it.each([
    ['StepProgress', <StepProgress key="s" step={2} total={5} label="Étape 2 sur 5" />],
    ['MeasureBar', <MeasureBar key="m" label="Vitesse" value={7} max={10} index={2} />],
    [
      'FloatingChip',
      <FloatingChip key="f" index={3}>
        Cameroun
      </FloatingChip>,
    ],
    [
      'OzIdCard',
      <OzIdCard
        key="o"
        name="Éliot Moukoko"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        qr={<span>QR</span>}
        reveal
      />,
    ],
  ])('%s', (_, element) => {
    expect(renderToStaticMarkup(element)).not.toContain('style=');
  });
});

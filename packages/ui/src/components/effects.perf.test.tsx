import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import '../../.storybook/storybook.css';
import { FloatingChip, GlassPanel, Halo, PitchCircles } from './emotion.js';
import { OzIdCard } from './oz-id-card.js';
import { Skeleton, SkeletonGroup } from './skeleton.js';

declare module 'vitest/browser' {
  interface BrowserCommands {
    throttleCpu: (rate: number) => Promise<void>;
  }
}

// Coût des effets en boucle (design.md §8.11 n° 5) : images par seconde sur 2 s, processeur ×4.
const CPU_RATE = 4;
const WINDOW_MS = 2000;
const MIN_FPS = 50;

async function framesPerSecond(): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames += 1;
      if (now - start < WINDOW_MS) requestAnimationFrame(tick);
      else resolve((frames * 1000) / (now - start));
    };
    requestAnimationFrame(tick);
  });
}

const EFFECTS: [string, ReactNode][] = [
  [
    'E1 halo',
    <Halo key="1">
      <OzIdCard name="Junior Mbarga" ozId="OZ-CM-26-7K4M9Q-3" ozIdLabel="OZ ID" />
    </Halo>,
  ],
  [
    'E14 squelettes',
    <SkeletonGroup key="14" label="Chargement">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-72" />
      ))}
    </SkeletonGroup>,
  ],
  ['E16 cercles du terrain', <PitchCircles key="16" className="size-80" />],
  [
    'E18 verre dépoli',
    <div key="18" className="bg-oz-primary p-8">
      <GlassPanel>Pourquoi OZ</GlassPanel>
    </div>,
  ],
  [
    'E20 puces pays',
    <div key="20" className="flex flex-wrap gap-2">
      {['Cameroun', 'Sénégal', 'Mali', 'Ghana', 'Nigeria', 'Gabon'].map((c, i) => (
        <FloatingChip key={c} index={i}>
          {c}
        </FloatingChip>
      ))}
    </div>,
  ],
];

beforeAll(async () => {
  await commands.throttleCpu(CPU_RATE);
});

afterEach(() => {
  cleanup();
});

describe(`coût des effets, processeur ralenti ×${String(CPU_RATE)}`, () => {
  it.for(EFFECTS)('%s : au moins 50 images par seconde', async ([name, node], { annotate }) => {
    render(<div className="w-[360px]">{node}</div>);
    const fps = await framesPerSecond();
    await annotate(`${name} : ${fps.toFixed(1)} i/s`);
    expect(fps).toBeGreaterThanOrEqual(MIN_FPS);
  });
});

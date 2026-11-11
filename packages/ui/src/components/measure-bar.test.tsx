import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeasureBar } from './measure-bar.js';

type Callback = (entries: { isIntersecting: boolean }[]) => void;

function mockObserver() {
  const instances: { callback: Callback; disconnect: ReturnType<typeof vi.fn> }[] = [];
  class Observer {
    disconnect = vi.fn();
    constructor(public callback: Callback) {
      instances.push(this);
    }
    observe() {}
  }
  vi.stubGlobal('IntersectionObserver', Observer);
  return instances;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MeasureBar', () => {
  it('compteur accessible : valeur, bornes et texte', () => {
    render(<MeasureBar label="Sprint 30 m" value={4.3} max={6} unit="s" />);
    const meter = screen.getByRole('meter', { name: 'Sprint 30 m' });
    expect(meter.getAttribute('aria-valuetext')).toBe('4.3 s');
  });

  it('au défilement : en pause tant que la barre n’est pas visible, puis jouée une fois', () => {
    const observers = mockObserver();
    render(<MeasureBar label="Identité" value={9} max={10} animateOnView />);
    const fill = screen.getByTestId('measure-bar-fill');
    expect(fill.className).toContain('[animation-play-state:paused]');
    expect(fill.dataset.inview).toBeUndefined();
    act(() => observers[0]?.callback([{ isIntersecting: true }]));
    expect(fill.dataset.inview).toBe('true');
    expect(fill.className).toContain('data-[inview=true]:[animation-play-state:running]');
    expect(observers[0]?.disconnect).toHaveBeenCalled();
  });

  it('sans IntersectionObserver : jouée d’emblée', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<MeasureBar label="Identité" value={9} max={10} animateOnView />);
    expect(screen.getByTestId('measure-bar-fill').dataset.inview).toBe('true');
  });

  it('par défaut, comportement inchangé : animée dès le montage', () => {
    render(<MeasureBar label="Identité" value={9} max={10} />);
    expect(screen.getByTestId('measure-bar-fill').className).not.toContain('paused');
  });
});

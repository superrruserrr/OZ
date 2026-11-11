import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LivePanel } from './live-panel.js';

const FACTS = [
  { label: 'Identité', value: 'Vérifiée' },
  { label: 'Mineurs', value: 'Protégés' },
];

describe('LivePanel', () => {
  it('panneau vitré avec statut, titre, texte et faits fournis', () => {
    render(
      <LivePanel
        status="Réseau en ouverture"
        title="Chaque profil,"
        highlight="plus de preuves."
        facts={FACTS}
      >
        Identité vérifiée et vidéos courtes.
      </LivePanel>,
    );
    const panel = screen.getByTestId('live-panel');
    expect(panel.textContent).toContain('Réseau en ouverture');
    expect(panel.textContent).toContain('Chaque profil,');
    expect(screen.getByText('plus de preuves.').className).toContain('text-oz-accent');
    const terms = [...panel.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(terms).toEqual(['Identité', 'Mineurs']);
  });

  it('la pastille en direct est décorative et ne pulse qu’en motion-safe', () => {
    render(<LivePanel status="En direct" title="Titre" />);
    const dot = screen.getByTestId('live-dot');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(dot.className).toContain('motion-safe:animate-oz-pulse');
  });

  it('n’invente aucun chiffre : seul le contenu passé en props s’affiche (M5)', () => {
    render(<LivePanel status="Bientôt" title="Titre" facts={FACTS} />);
    expect(screen.getByTestId('live-panel').textContent).not.toMatch(/\d/);
  });
});

import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ChoiceCardGroup, type ChoiceOption } from './choice-card.js';
import { IconTile } from './icon-tile.js';

// Cartes de choix (écran 02, E9) : groupe radio au clavier, désactivé, tuile d'icône.

const OPTIONS: ChoiceOption[] = [
  { value: 'player', title: 'Joueur', description: 'Je crée mon OZ ID' },
  { value: 'guardian', title: 'Tuteur légal', disabled: true },
  { value: 'club', title: 'Club' },
];

function Harness({ initial }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ChoiceCardGroup
      label="Type de compte"
      testId="role-card"
      options={OPTIONS}
      value={value}
      onValueChange={setValue}
    />
  );
}

describe('ChoiceCardGroup', () => {
  it('groupe radio nommé, une carte cochée à la fois', async () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Type de compte' })).toBeTruthy();
    await userEvent.click(screen.getByTestId('role-card-player'));
    expect(screen.getByRole('radio', { name: /Joueur/ }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(screen.getByTestId('role-card-club'));
    expect(screen.getByRole('radio', { name: /Joueur/ }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Club' }).getAttribute('aria-checked')).toBe('true');
  });

  it('un seul arrêt de tabulation ; flèches : déplacent et cochent, sautent le désactivé', async () => {
    render(<Harness initial="player" />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    await userEvent.tab();
    expect(document.activeElement).toBe(radios[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radios[2]);
    expect(radios[2]?.getAttribute('aria-checked')).toBe('true');
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(radios[0]);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(radios[2]);
  });

  it('espace coche la carte focalisée ; sans valeur, la première active est focalisable', async () => {
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    expect(radios[0]?.tabIndex).toBe(0);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('carte désactivée : non sélectionnable', async () => {
    render(<Harness />);
    const guardian = screen.getByTestId('role-card-guardian');
    expect(guardian.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(guardian);
    expect(guardian.getAttribute('aria-checked')).toBe('false');
  });

  it('zone cliquable d’au moins 44 px (EX-T22)', () => {
    render(<Harness />);
    expect(screen.getByTestId('role-card-player').className).toContain('min-h-16');
  });
});

describe('IconTile', () => {
  it.each([
    ['sm', 'size-11'],
    ['md', 'size-12'],
    ['lg', 'size-14'],
  ] as const)('taille %s : %s, fond tint-green, décorative', (size, cls) => {
    const { container } = render(<IconTile size={size}>i</IconTile>);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).toContain(cls);
    expect(tile.className).toContain('bg-oz-tint-green');
    expect(tile.getAttribute('aria-hidden')).toBe('true');
  });
});

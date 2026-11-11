import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CountryFlag, countryName } from './country';
import { POSITION_SPOTS, positionKey } from './labels';
import { PlayerAvatar } from './player-avatar';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));

const { criteriaQuery, parseCriteria, readPlayer, searchPlayers, SEARCH_POSITIONS } =
  await import('./players-api');

describe('critères de l’annuaire (lot 1.5dc)', () => {
  it('ne garde que les valeurs au bon format', () => {
    expect(
      parseCriteria({ q: '  Ba ', position: 'striker', country: 'CM', cursor: 'abc_DEF-1' }),
    ).toEqual({ q: 'Ba', position: 'striker', country: 'CM', cursor: 'abc_DEF-1' });
    expect(
      parseCriteria({
        q: 'a',
        position: 'libero',
        country: 'cm',
        cursor: 'a b',
        organizationId: 'x',
      }),
    ).toEqual({});
    expect(parseCriteria({ q: ['a', 'b'] })).toEqual({});
  });

  it('chaîne de requête sans champ vide', () => {
    expect(criteriaQuery({ q: 'Ba', country: 'CM' })).toBe('q=Ba&country=CM');
    expect(criteriaQuery({})).toBe('');
  });

  it('sans session : aucun appel, lecture « non connecté »', async () => {
    expect((await searchPlayers({})).kind).toBe('unauthenticated');
  });

  it('OZ ID hors format : jamais transmis à l’API', async () => {
    expect((await readPlayer('../admin')).kind).toBe('not_found');
    expect((await readPlayer('OZ-CM-26-7K4M9Q')).kind).toBe('not_found');
  });
});

describe('libellés et repères', () => {
  it('clé i18n et point du terrain pour chaque poste', () => {
    expect(positionKey('centre_back')).toBe('centreBack');
    expect(positionKey('striker')).toBe('striker');
    for (const position of SEARCH_POSITIONS) expect(POSITION_SPOTS[position]).toBeTruthy();
  });

  it('drapeau servi par le site, décoratif ; code inconnu : rien', () => {
    const { container } = render(
      <>
        <CountryFlag code="CM" />
        <CountryFlag code="ZZ" />
        <CountryFlag code="cm" />
      </>,
    );
    expect(screen.getByTestId('flag-CM').getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('[style], image')).toBeNull();
    expect(countryName('CM', 'fr')).toBe('Cameroun');
  });

  it('avatar en initiales, jamais une image', () => {
    const { container } = render(<PlayerAvatar firstName="Ramata" lastName="Ba" />);
    expect(screen.getByTestId('player-avatar').textContent).toBe('RB');
    expect(container.querySelector('img')).toBeNull();
  });
});

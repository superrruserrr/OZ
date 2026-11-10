import type { SignupStatusOutput } from '@oz/contracts';
import { describe, expect, it } from 'vitest';
import { nextPath, openStep, progress, stepFromSlug, stepPath, stepsFor } from './steps';

const IDENTITY = {
  firstName: 'Awa',
  lastName: 'Diallo',
  birthDate: '2000-04-12',
  nationality: 'SN',
  country: 'SN',
};
const SPORT = { primaryPosition: 'striker', dominantFoot: 'right' } as const;

function status(over: Partial<SignupStatusOutput> = {}): SignupStatusOutput {
  return {
    steps: { identity: null, sport: null, affiliation: null, guardian: null },
    minor: null,
    missing: ['identity', 'sport', 'affiliation'],
    expiresAt: null,
    ...over,
  };
}

describe('étapes du parcours (EX-107)', () => {
  it('associe les adresses françaises aux étapes du contrat', () => {
    expect(stepFromSlug('identite')).toBe('identity');
    expect(stepFromSlug('physique')).toBe('sport');
    expect(stepFromSlug('rattachement')).toBe('affiliation');
    expect(stepFromSlug('tuteur')).toBe('guardian');
    expect(stepFromSlug('identity')).toBeNull();
    expect(stepFromSlug('__proto__')).toBeNull();
    expect(stepPath('sport')).toBe('/onboarding/physique');
  });

  it('ajoute le tuteur seulement pour un mineur déclaré par le serveur', () => {
    expect(stepsFor(null)).toEqual(['identity', 'sport', 'affiliation']);
    expect(stepsFor(false)).toEqual(['identity', 'sport', 'affiliation']);
    expect(stepsFor(true)).toEqual(['identity', 'sport', 'affiliation', 'guardian']);
  });

  it('reprend à la première étape manquante, sinon à la finalisation', () => {
    expect(nextPath(status())).toBe('/onboarding/identite');
    expect(
      nextPath(
        status({
          steps: { identity: IDENTITY, sport: SPORT, affiliation: null, guardian: null },
          missing: ['affiliation'],
        }),
      ),
    ).toBe('/onboarding/rattachement');
    expect(nextPath(status({ missing: [] }))).toBe('/onboarding/oz-id');
  });

  it('refuse une étape ouverte hors ordre', () => {
    expect(openStep('sport', status())).toEqual({ redirect: '/onboarding/identite' });
    const done = status({
      steps: { identity: IDENTITY, sport: SPORT, affiliation: null, guardian: null },
      minor: false,
      missing: ['affiliation'],
    });
    expect(openStep('identity', done)).toEqual({ open: true });
    expect(openStep('affiliation', done)).toEqual({ open: true });
    expect(openStep('guardian', done)).toEqual({ redirect: '/onboarding/rattachement' });
  });

  it('ouvre le tuteur d’un mineur une fois les étapes précédentes remplies', () => {
    const minor = status({
      steps: { identity: IDENTITY, sport: SPORT, affiliation: { mode: 'none' }, guardian: null },
      minor: true,
      missing: ['guardian'],
    });
    expect(openStep('guardian', minor)).toEqual({ open: true });
    expect(nextPath(minor)).toBe('/onboarding/tuteur');
  });

  it('compte la carte OZ ID comme dernière étape de la progression (E7)', () => {
    expect(progress('identity', null)).toEqual({ step: 1, total: 4 });
    expect(progress('guardian', true)).toEqual({ step: 4, total: 5 });
    expect(progress('ozId', false)).toEqual({ step: 4, total: 4 });
  });
});

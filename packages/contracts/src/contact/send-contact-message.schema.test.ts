import { describe, expect, it } from 'vitest';
import { ORGANISATION_TYPES, sendContactMessageSchema } from './send-contact-message.schema.js';

const valid = {
  name: 'Éliot Moukoko',
  email: 'Eliot@Exemple.CM',
  organisationType: 'academy',
  message: 'Bonjour, notre académie souhaite rejoindre OZ.',
  consent: true,
};

describe('sendContactMessageSchema', () => {
  it('accepte un message valide et normalise l’email', () => {
    expect(sendContactMessageSchema.parse(valid)).toEqual({ ...valid, email: 'eliot@exemple.cm' });
  });

  it('propose les 7 profils et « autre »', () => {
    expect([...ORGANISATION_TYPES].sort()).toEqual(
      [
        'academy',
        'club',
        'federation',
        'guardian',
        'other',
        'performance_center',
        'player',
        'recruiter',
      ].sort(),
    );
  });

  it.each([
    ['message trop court', { message: 'Trop court.' }],
    ['message trop long', { message: 'x'.repeat(2_001) }],
    ['type inconnu', { organisationType: 'agent-secret' }],
    ['consentement absent', { consent: false }],
    ['email invalide', { email: 'eliot' }],
  ])('refuse : %s', (_, override) => {
    expect(sendContactMessageSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('refuse un champ inconnu (D2)', () => {
    const result = sendContactMessageSchema.safeParse({ ...valid, isAdmin: true });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.code).toBe('unrecognized_keys');
  });
});

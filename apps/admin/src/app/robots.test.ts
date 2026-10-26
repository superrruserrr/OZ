// @vitest-environment node
import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots.txt du back-office', () => {
  it('interdit toute indexation, quel que soit l’environnement', () => {
    expect(robots().rules).toEqual({ userAgent: '*', disallow: '/' });
  });
});

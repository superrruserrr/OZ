import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { authenticated } from './access-token.guard.js';
import { currentUserOf } from './current-user.decorator.js';

describe('currentUserOf', () => {
  it('rend le titulaire posé par la garde', () => {
    const req = {} as Request;
    const subject = { userId: 'u', familyId: 'f' };
    authenticated.set(req, subject);
    expect(currentUserOf(req)).toBe(subject);
  });

  it('refuse une route montée sans la garde', () => {
    expect(() => currentUserOf({} as Request)).toThrow(/AccessTokenGuard/);
  });
});

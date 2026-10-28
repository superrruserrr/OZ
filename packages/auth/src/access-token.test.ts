import fc from 'fast-check';
import { decodeJwt, decodeProtectedHeader, SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { ACCESS_TOKEN_TTL_SECONDS, AccessTokens } from './access-token.js';

const key = new Uint8Array(64).fill(7);
const otherKey = new Uint8Array(64).fill(8);
const subject = {
  userId: '0b6f5c1e-3d0a-4f39-9a51-7d6f1c2e8a90',
  familyId: '5e2d8c4b-1a7f-4c36-b0e9-3f8a6d1c2b47',
};
const now = new Date('2026-10-28T10:00:00Z');
const at = (seconds: number): Date => new Date(now.getTime() + seconds * 1000);

describe("jetons d'accès (EX-103 n° 3)", () => {
  it('signe puis vérifie : rend le sujet et la famille', async () => {
    const tokens = new AccessTokens(key);
    const issued = await tokens.issue(subject, now);
    expect(issued.expiresIn).toBe(900);
    expect(await tokens.verify(issued.token, now)).toEqual(subject);
  });

  it('ne porte que les claims prévus, sans rôle ni âge, en HS256', async () => {
    const { token } = await new AccessTokens(key).issue(subject, now);
    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decodeJwt(token);
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'jti', 'sid', 'sub']);
    expect(Number(payload.exp) - Number(payload.iat)).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(payload.sub).toBe(subject.userId);
    expect(payload.sid).toBe(subject.familyId);
  });

  it('un jti différent à chaque émission', async () => {
    const tokens = new AccessTokens(key);
    const a = decodeJwt((await tokens.issue(subject, now)).token).jti;
    const b = decodeJwt((await tokens.issue(subject, now)).token).jti;
    expect(a).not.toBe(b);
  });

  it('refuse un jeton expiré au-delà de la tolérance de 30 s', async () => {
    const tokens = new AccessTokens(key);
    const { token } = await tokens.issue(subject, now);
    expect(await tokens.verify(token, at(900 + 29))).toEqual(subject);
    expect(await tokens.verify(token, at(900 + 31))).toBeNull();
  });

  it('refuse un jeton émis dans le futur', async () => {
    const tokens = new AccessTokens(key);
    const { token } = await tokens.issue(subject, at(120));
    expect(await tokens.verify(token, now)).toBeNull();
  });

  it('refuse une autre clé', async () => {
    const { token } = await new AccessTokens(otherKey).issue(subject, now);
    expect(await new AccessTokens(key).verify(token, now)).toBeNull();
  });

  it('refuse alg none, un autre algorithme HMAC, un émetteur ou une audience faux', async () => {
    const tokens = new AccessTokens(key);
    const iat = Math.floor(now.getTime() / 1000);
    const base = () =>
      new SignJWT({ sid: subject.familyId })
        .setSubject(subject.userId)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 900)
        .setJti('x');
    const none = new UnsecuredJWT({ sid: subject.familyId })
      .setSubject(subject.userId)
      .setIssuer('oz-api')
      .setAudience('oz')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 900)
      .setJti('x')
      .encode();
    const hs512 = await base()
      .setProtectedHeader({ alg: 'HS512', typ: 'JWT' })
      .setIssuer('oz-api')
      .setAudience('oz')
      .sign(key);
    const issuer = await base()
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('autre')
      .setAudience('oz')
      .sign(key);
    const audience = await base()
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('oz-api')
      .setAudience('autre')
      .sign(key);
    for (const token of [none, hs512, issuer, audience]) {
      expect(await tokens.verify(token, now)).toBeNull();
    }
  });

  it('refuse un jeton bien signé dont la durée dépasse 15 minutes', async () => {
    const iat = Math.floor(now.getTime() / 1000);
    const long = await new SignJWT({ sid: subject.familyId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject.userId)
      .setIssuer('oz-api')
      .setAudience('oz')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 365 * 86_400)
      .setJti('x')
      .sign(key);
    expect(await new AccessTokens(key).verify(long, at(16 * 60))).toBeNull();
  });

  it('refuse un sujet ou une famille qui ne sont pas des UUID, et un claim manquant', async () => {
    const tokens = new AccessTokens(key);
    const iat = Math.floor(now.getTime() / 1000);
    const sign = (claims: Record<string, unknown>, sub?: string) => {
      const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer('oz-api')
        .setAudience('oz')
        .setIssuedAt(iat)
        .setExpirationTime(iat + 900)
        .setJti('x');
      return (sub === undefined ? jwt : jwt.setSubject(sub)).sign(key);
    };
    expect(await tokens.verify(await sign({ sid: 'abc' }, subject.userId), now)).toBeNull();
    expect(await tokens.verify(await sign({ sid: subject.familyId }, 'abc'), now)).toBeNull();
    expect(await tokens.verify(await sign({ sid: 42 }, subject.userId), now)).toBeNull();
    expect(await tokens.verify(await sign({ sid: subject.familyId }), now)).toBeNull();
  });

  it("refuse toute altération d'un caractère (propriété)", async () => {
    const tokens = new AccessTokens(key);
    const { token } = await tokens.issue(subject, now);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: token.length - 1 }),
        fc.constantFrom(...Array.from(alphabet)),
        async (index, char) => {
          fc.pre(token[index] !== '.' && token[index] !== char);
          const altered = token.slice(0, index) + char + token.slice(index + 1);
          // Un dernier caractère base64url peut porter des bits ignorés : le décodage reste identique.
          const same =
            Buffer.from(altered.split('.')[2] ?? '', 'base64url').equals(
              Buffer.from(token.split('.')[2] ?? '', 'base64url'),
            ) &&
            altered.split('.').slice(0, 2).join('.') === token.split('.').slice(0, 2).join('.');
          fc.pre(!same);
          expect(await tokens.verify(altered, now)).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('refuse les formats inattendus sans les décoder', async () => {
    const tokens = new AccessTokens(key);
    for (const token of ['', 'a.b', 'a.b.c.d', `${'a'.repeat(1100)}.b.c`, 'a b.c.d']) {
      expect(await tokens.verify(token, now)).toBeNull();
    }
  });

  it('exige une clé de 64 octets et des identifiants UUID', async () => {
    expect(() => new AccessTokens(new Uint8Array(63))).toThrow(RangeError);
    await expect(
      new AccessTokens(key).issue({ userId: 'x', familyId: subject.familyId }, now),
    ).rejects.toThrow(TypeError);
  });

  it('copie la clé : la modifier ensuite ne change rien', async () => {
    const mutable = new Uint8Array(64).fill(1);
    const tokens = new AccessTokens(mutable);
    const { token } = await tokens.issue(subject, now);
    mutable.fill(2);
    expect(await tokens.verify(token, now)).toEqual(subject);
  });
});

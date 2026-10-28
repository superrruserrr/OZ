import { describe, expect, it } from 'vitest';
import { clientIp, rateLimitKey } from './client-ip.js';

describe('clientIp', () => {
  it('ramène une IPv4 mappée sur IPv6 en IPv4', () => {
    expect(clientIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp('::FFFF:203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp('::ffff:cb00:7109')).toBe('203.0.113.9');
    expect(clientIp('0:0:0:0:0:ffff:cb00:7109')).toBe('203.0.113.9');
    expect(clientIp('::ffff:203.0.113.9%eth0')).toBe('203.0.113.9');
  });

  it('retire l’identifiant de zone (refusé par le type inet)', () => {
    expect(clientIp('fe80::1%eth0')).toBe('fe80::1');
  });

  it('laisse une IPv4 ou une IPv6 telle quelle, et rejette le reste', () => {
    expect(clientIp('203.0.113.9')).toBe('203.0.113.9');
    expect(clientIp('2001:db8::1')).toBe('2001:db8::1');
    expect(clientIp(undefined)).toBeNull();
    expect(clientIp('pas-une-ip')).toBeNull();
  });
});

describe('rateLimitKey', () => {
  it('IPv4 entière', () => {
    expect(rateLimitKey('203.0.113.9')).toBe('203.0.113.9');
    expect(rateLimitKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('IPv6 comptée par /64 : un client qui change d’adresse dans son bloc garde la même clé', () => {
    const a = rateLimitKey('2001:db8:1:2:aaaa::1');
    expect(a).toBe('2001:db8:1:2::/64');
    expect(rateLimitKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe(a);
    expect(rateLimitKey('2001:db8:1:3::1')).not.toBe(a);
    expect(rateLimitKey('::1')).toBe('0:0:0:0::/64');
  });

  it('IPv4 mappée en hexadécimal : la clé de l’IPv4, pas un /64 commun', () => {
    expect(rateLimitKey('::ffff:c000:201')).toBe('192.0.2.1');
    expect(rateLimitKey('::ffff:c000:202')).toBe('192.0.2.2');
  });

  it('adresse absente ou illisible : pas de clé (requête refusée, jamais de compteur commun)', () => {
    expect(rateLimitKey(undefined)).toBeNull();
    expect(rateLimitKey('x')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { deviceLabel } from './device.js';

describe('deviceLabel', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox · macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome · Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge · Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'Opera · Linux',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari · iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
      'Chrome · iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'Samsung Internet · Android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome · ChromeOS',
    ],
    ['curl/8.7.1', null],
    ['Mozilla/5.0 (Linux; Android 14) UnknownBrowser/1.0', 'Navigateur inconnu · Android'],
    ['Firefox/130.0', 'Firefox · Système inconnu'],
  ])('%s → %s', (userAgent, expected) => {
    expect(deviceLabel(userAgent)).toBe(expected);
  });

  it('ignore un en-tête absent ou démesuré', () => {
    expect(deviceLabel(undefined)).toBeNull();
    expect(deviceLabel(`Firefox/1 ${'a'.repeat(600)}`)).toBeNull();
  });

  it('ne recopie jamais le texte reçu : le libellé vient de listes fermées', () => {
    const label = deviceLabel('<script>alert(1)</script> Firefox/1 Windows');
    expect(label).toBe('Firefox · Windows');
  });
});

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPdf } from '../test/fixtures.js';
import { inspectPdf } from './pdf.js';

// Contrôle des PDF (lot 1.9b, tâche 5, D5) : 1 à 20 pages, chiffré ou illisible refusé, rien d'exécuté.

describe('inspectPdf', () => {
  it.each([1, 3, 20])('%i page(s) : acceptées', async (pages) => {
    expect(await inspectPdf(buildPdf(pages))).toEqual({ ok: true, pageCount: pages });
  });

  it('21 pages → rejected/pages', async () => {
    expect(await inspectPdf(buildPdf(21))).toEqual({ ok: false, reason: 'pages' });
  });

  it('aucune page → rejected/pages', async () => {
    expect(await inspectPdf(buildPdf(0))).toEqual({ ok: false, reason: 'pages' });
  });

  it('nombre annoncé supérieur aux pages réelles : les pages réelles comptent', async () => {
    expect(await inspectPdf(buildPdf(2, { count: 5 }))).toEqual({ ok: true, pageCount: 2 });
    expect(await inspectPdf(buildPdf(3, { count: 0 }))).toEqual({ ok: false, reason: 'pages' });
  });

  it('nombre annoncé inférieur : pdf.js retient l’annonce (risque résiduel documenté)', async () => {
    // Les pages au-delà de /Count ne sont lues ni par pdf.js ni par ce contrôle (docs/security/documents.md).
    expect(await inspectPdf(buildPdf(25, { count: 1 }))).toEqual({ ok: true, pageCount: 1 });
  });

  it('PDF chiffré → rejected/unreadable', async () => {
    const hex = (byte: string) => `<${byte.repeat(32)}>`;
    const encrypted = buildPdf(1, {
      trailer: ` /Encrypt << /Filter /Standard /V 1 /R 2 /O ${hex('ab')} /U ${hex('cd')} /P -4 >> /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]`,
    });
    expect(await inspectPdf(encrypted)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('PDF chiffré mais lisible sans mot de passe (utilisateur vide) → rejected/unreadable', async () => {
    // Gestionnaire standard R2 (RC4 40 bits) : pdf.js l'ouvre et le déchiffre sans rien signaler.
    const pad = Buffer.from(
      '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
      'hex',
    );
    const rc4 = (key: Buffer, data: Buffer): Buffer => {
      const box = Array.from({ length: 256 }, (_, i) => i);
      for (let i = 0, j = 0; i < 256; i += 1) {
        j = (j + (box[i] ?? 0) + (key[i % key.length] ?? 0)) % 256;
        [box[i], box[j]] = [box[j] ?? 0, box[i] ?? 0];
      }
      const out = Buffer.alloc(data.length);
      for (let n = 0, i = 0, j = 0; n < data.length; n += 1) {
        i = (i + 1) % 256;
        j = (j + (box[i] ?? 0)) % 256;
        [box[i], box[j]] = [box[j] ?? 0, box[i] ?? 0];
        out[n] = (data[n] ?? 0) ^ (box[((box[i] ?? 0) + (box[j] ?? 0)) % 256] ?? 0);
      }
      return out;
    };
    const md5 = (...parts: Buffer[]): Buffer =>
      createHash('md5').update(Buffer.concat(parts)).digest();
    const id = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const owner = rc4(md5(pad).subarray(0, 5), pad);
    const permissions = Buffer.alloc(4);
    permissions.writeInt32LE(-4);
    const key = md5(pad, owner, permissions, id).subarray(0, 5);
    const user = rc4(key, pad);
    const pdf = buildPdf(1, {
      trailer: ` /Encrypt << /Filter /Standard /V 1 /R 2 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >> /ID [<${id.toString('hex')}> <${id.toString('hex')}>]`,
    });
    expect(await inspectPdf(pdf)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it.each([
    ['tronqué', buildPdf(3).subarray(0, 60)],
    ['pas un PDF', Buffer.from('bonjour')],
    ['vide', Buffer.alloc(0)],
  ])('%s → rejected/unreadable', async (_label, data) => {
    expect(await inspectPdf(data)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('action JavaScript à l’ouverture : jamais exécutée', async () => {
    expect(await inspectPdf(buildPdf(1, { script: true }))).toEqual({ ok: true, pageCount: 1 });
    expect((globalThis as { ozPwned?: boolean }).ozPwned).toBeUndefined();
  });

  it('le tampon fourni n’est ni modifié ni transféré', async () => {
    const data = buildPdf(2);
    const copy = Buffer.from(data);
    await inspectPdf(data);
    expect(data.byteLength).toBe(copy.byteLength);
    expect(Buffer.compare(data, copy)).toBe(0);
  });
});

import { createHash } from 'node:crypto';
import type { ClaimedDocument, ScanVerdict } from '@oz/db';
import { StorageError } from '@oz/storage';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPdf } from '../test/fixtures.js';
import { ClamavError, type ClamavVerdict } from './clamav.js';
import { scanDocument, type ScanDependencies } from './scan-document.js';

// Traitement `scan-document` (lot 1.9b, tâche 6) avec des doublures : ordre, pannes, rejeu, nettoyage.

const ID = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let png: Buffer;
let stored: Map<string, Uint8Array>;
let calls: string[];
let deps: ScanDependencies;
let claimed: ClaimedDocument | null;
let clamav: () => Promise<ClamavVerdict>;
let finished: { verdict: ScanVerdict; outcome: 'done' | 'skipped' } | null;
let logs: { level: string; event: string; fields: Record<string, unknown> }[];

const claim = (bytes: Uint8Array, mimeType = 'image/png'): ClaimedDocument => ({
  id: ID,
  type: 'identity_document',
  storageKey: `quarantine/${ID}`,
  mimeType,
  sizeBytes: bytes.byteLength,
  sha256: sha256(bytes),
});

beforeEach(async () => {
  png = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#3a7' } })
    .png()
    .toBuffer();
  stored = new Map([[`quarantine/${ID}`, png]]);
  calls = [];
  logs = [];
  claimed = claim(png);
  clamav = () => Promise.resolve({ verdict: 'clean' });
  finished = null;
  const log =
    (level: string) =>
    (fields: Record<string, unknown>, event: string): void => {
      logs.push({ level, event, fields });
    };
  deps = {
    claim: vi.fn(() => {
      calls.push('claim');
      return Promise.resolve(claimed);
    }),
    finish: vi.fn((_id: string, verdict: ScanVerdict) => {
      calls.push(`finish:${verdict.verdict}`);
      finished = { verdict, outcome: 'done' };
      return Promise.resolve('done' as const);
    }),
    storage: {
      read: vi.fn((key: string) => {
        calls.push(`read:${key.split('/')[0] ?? ''}`);
        return Promise.resolve(stored.get(key) ?? null);
      }),
      put: vi.fn((key: string, body: Uint8Array) => {
        calls.push(`put:${key.split('/')[0] ?? ''}`);
        stored.set(key, body);
        return Promise.resolve();
      }),
      remove: vi.fn((key: string) => {
        calls.push(`remove:${key.split('/')[0] ?? ''}`);
        stored.delete(key);
        return Promise.resolve();
      }),
    },
    clamav: {
      scan: vi.fn(() => {
        calls.push('clamav');
        return clamav();
      }),
    },
    logger: { info: log('info'), warn: log('warn'), error: log('error') },
  };
});

describe('document sain', () => {
  it('image : ordre claim → lecture → antivirus → clean/ → verdict → quarantaine retirée', async () => {
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('clean');
    expect(calls).toEqual([
      'claim',
      'read:quarantine',
      'clamav',
      'put:clean',
      'finish:clean',
      'remove:quarantine',
    ]);
    expect(stored.has(`quarantine/${ID}`)).toBe(false);
    const clean = stored.get(`clean/${ID}`);
    expect(clean).toBeDefined();
    expect(finished?.verdict).toMatchObject({
      verdict: 'clean',
      sizeBytes: clean?.byteLength,
      image: { width: 400, height: 300 },
      pageCount: null,
    });
  });

  it('PDF : copié tel quel sous clean/, nombre de pages au verdict', async () => {
    const pdf = buildPdf(3);
    stored.set(`quarantine/${ID}`, pdf);
    claimed = claim(pdf, 'application/pdf');
    await scanDocument(deps, ID, { lastAttempt: false });
    expect(Buffer.compare(Buffer.from(stored.get(`clean/${ID}`) ?? []), pdf)).toBe(0);
    expect(finished?.verdict).toEqual({
      verdict: 'clean',
      sizeBytes: pdf.byteLength,
      image: null,
      pageCount: 3,
    });
  });

  it('verdict ignoré (`skipped`, analyse concurrente) : quarantaine laissée à l’autre analyse', async () => {
    deps.finish = vi.fn(() => Promise.resolve('skipped' as const));
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('skipped');
    expect(stored.has(`quarantine/${ID}`)).toBe(true);
  });

  it('quarantaine non retirée après verdict : journalisé, verdict maintenu', async () => {
    deps.storage.remove = vi.fn(() => Promise.reject(new StorageError('DELETE a échoué')));
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('clean');
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'document.scan.quarantine_cleanup_failed' }),
    );
  });
});

describe('document dangereux ou hors bornes', () => {
  it('infecté : verdict, fichier supprimé, rien sous clean/, alerte sans donnée personnelle', async () => {
    clamav = () => Promise.resolve({ verdict: 'infected', signature: 'Eicar-Signature' });
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('infected');
    expect(calls).toEqual([
      'claim',
      'read:quarantine',
      'clamav',
      'finish:infected',
      'remove:quarantine',
    ]);
    expect(stored.size).toBe(0);
    expect(logs).toEqual([
      {
        level: 'error',
        event: 'document.scan.infected',
        fields: { documentId: ID, documentType: 'identity_document', signature: 'Eicar-Signature' },
      },
    ]);
  });

  it('infecté mais déjà jugé par une analyse concurrente : quarantaine laissée', async () => {
    clamav = () => Promise.resolve({ verdict: 'infected', signature: 'Eicar-Signature' });
    deps.finish = vi.fn(() => Promise.resolve('skipped' as const));
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('skipped');
    expect(stored.has(`quarantine/${ID}`)).toBe(true);
  });

  it('empreinte différente de la déclarée : rejected/hash_mismatch, sans antivirus, alerte', async () => {
    claimed = { ...claim(png), sha256: 'ab'.repeat(32) };
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('rejected');
    expect(calls).toEqual(['claim', 'read:quarantine', 'finish:rejected', 'remove:quarantine']);
    expect(finished?.verdict).toEqual({ verdict: 'rejected', reason: 'hash_mismatch' });
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'warn', event: 'document.scan.hash_mismatch' }),
    );
  });

  it('image trop petite : rejected/dimensions, fichier supprimé', async () => {
    const tiny = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    stored.set(`quarantine/${ID}`, tiny);
    claimed = claim(tiny);
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('rejected');
    expect(finished?.verdict).toEqual({ verdict: 'rejected', reason: 'dimensions' });
    expect(stored.size).toBe(0);
  });

  it('PDF de 21 pages : rejected/pages', async () => {
    const pdf = buildPdf(21);
    stored.set(`quarantine/${ID}`, pdf);
    claimed = claim(pdf, 'application/pdf');
    await scanDocument(deps, ID, { lastAttempt: false });
    expect(finished?.verdict).toEqual({ verdict: 'rejected', reason: 'pages' });
  });

  it('type hors liste (ex. vidéo) : rejected/unreadable', async () => {
    claimed = claim(png, 'video/mp4');
    await scanDocument(deps, ID, { lastAttempt: false });
    expect(finished?.verdict).toEqual({ verdict: 'rejected', reason: 'unreadable' });
  });
});

describe('rejeu et pannes', () => {
  it('document déjà jugé, inconnu ou supprimé : ignoré sans lecture', async () => {
    claimed = null;
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('skipped');
    expect(calls).toEqual(['claim']);
  });

  it('fichier absent de la quarantaine : erreur (nouvel essai), aucun verdict', async () => {
    stored.clear();
    await expect(scanDocument(deps, ID, { lastAttempt: false })).rejects.toThrow(/absent/);
    expect(finished).toBeNull();
  });

  it.each([
    [
      'ClamAV',
      () => {
        clamav = () => Promise.reject(new ClamavError('unavailable', 'injoignable'));
      },
    ],
    [
      'stockage',
      () => {
        deps.storage.read = vi.fn(() => Promise.reject(new StorageError('GET')));
      },
    ],
  ])(
    'panne %s : erreur propagée (nouvel essai), aucun verdict, rien sous clean/',
    async (_label, arrange) => {
      arrange();
      await expect(scanDocument(deps, ID, { lastAttempt: false })).rejects.toThrow();
      expect(finished).toBeNull();
      expect(stored.has(`clean/${ID}`)).toBe(false);
    },
  );

  it('dernier essai en panne : verdict `error`, alerte, quarantaine conservée', async () => {
    clamav = () => Promise.reject(new ClamavError('timeout', 'délai'));
    await expect(scanDocument(deps, ID, { lastAttempt: true })).rejects.toThrow();
    expect(finished?.verdict).toEqual({ verdict: 'error' });
    expect(stored.has(`quarantine/${ID}`)).toBe(true);
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'error',
        event: 'document.scan.failed',
        fields: { documentId: ID, cause: 'ClamavError' },
      }),
    );
  });

  it('dernier essai, rejet qui n’est pas une erreur : cause « inconnue »', async () => {
    // Rejet par une valeur qui n'est pas une Error (bibliothèque tierce mal écrite).
    const notAnError: unknown = 'chaîne';
    clamav = async () => {
      await Promise.resolve();
      throw notAnError;
    };
    await expect(scanDocument(deps, ID, { lastAttempt: true })).rejects.toBe('chaîne');
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'document.scan.failed',
        fields: { documentId: ID, cause: 'inconnue' },
      }),
    );
  });

  it('dernier essai, verdict `error` lui-même impossible : erreur d’origine propagée, journalisé', async () => {
    clamav = () => Promise.reject(new ClamavError('timeout', 'délai'));
    deps.finish = vi.fn(() => Promise.reject(new Error('base indisponible')));
    await expect(scanDocument(deps, ID, { lastAttempt: true })).rejects.toBeInstanceOf(ClamavError);
    expect(logs).toContainEqual(
      expect.objectContaining({ level: 'error', event: 'document.scan.error_verdict_failed' }),
    );
  });

  it('verdict `clean` impossible (réponse perdue) : clean/ conservé, quarantaine aussi, erreur propagée', async () => {
    deps.finish = vi.fn(() => Promise.reject(new Error('base indisponible')));
    await expect(scanDocument(deps, ID, { lastAttempt: false })).rejects.toThrow(/base/);
    // Le verdict a pu être validé : retirer clean/ laisserait un document `clean` sans fichier.
    expect(stored.has(`clean/${ID}`)).toBe(true);
    expect(stored.has(`quarantine/${ID}`)).toBe(true);
  });

  it('verdict déjà écrit par un autre essai : clean/ (même clé) laissé en place', async () => {
    deps.finish = vi.fn(() => Promise.resolve('skipped' as const));
    expect(await scanDocument(deps, ID, { lastAttempt: false })).toBe('skipped');
    expect(stored.has(`clean/${ID}`)).toBe(true);
  });

  it('les journaux ne portent ni contenu, ni clé, ni empreinte', async () => {
    clamav = () => Promise.resolve({ verdict: 'infected', signature: 'Eicar-Signature' });
    await scanDocument(deps, ID, { lastAttempt: false });
    const text = JSON.stringify(logs);
    expect(text).not.toContain('quarantine/');
    expect(text).not.toContain(sha256(png));
  });
});

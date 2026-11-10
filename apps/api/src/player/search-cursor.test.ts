import { describe, expect, it } from 'vitest';
import { openSearchCursor, sealSearchCursor, searchFingerprint } from './search-cursor.js';

// Curseur de la recherche (lot 1.14a, D6) : opaque, signé, lié au lecteur, aux critères et au tri ;
// il ne porte que l'identifiant de la dernière ligne, jamais une donnée de fiche.

const KEY = 'h'.repeat(48);
const READER = '00000000-0000-4000-8000-0000000000aa';
const LAST = '00000000-0000-4000-8000-000000000001';
const position = {
  sort: 'name',
  direction: 'asc',
  fingerprint: searchFingerprint({ country: 'CM' }),
} as const;

describe('curseur de recherche', () => {
  it('aller-retour : la position de la dernière ligne', () => {
    const cursor = sealSearchCursor(KEY, READER, { ...position, afterId: LAST });
    expect(cursor).toMatch(/^[A-Za-z0-9_-]{1,512}$/);
    expect(openSearchCursor(KEY, READER, cursor, position)).toBe(LAST);
  });

  it('aucune donnée de fiche ni critère en clair', () => {
    const fingerprint = searchFingerprint({ q: 'Ndongo', city: 'Douala' });
    const cursor = sealSearchCursor(KEY, READER, { ...position, fingerprint, afterId: LAST });
    const decoded = Buffer.from(cursor, 'base64url').toString('latin1');
    expect(decoded).not.toMatch(/ndongo|douala/i);
  });

  it('refusé : autre lecteur, autres critères, autre tri, autre clé, altéré', () => {
    const cursor = sealSearchCursor(KEY, READER, { ...position, afterId: LAST });
    const other = '00000000-0000-4000-8000-0000000000bb';
    expect(openSearchCursor(KEY, other, cursor, position)).toBeNull();
    expect(
      openSearchCursor(KEY, READER, cursor, {
        ...position,
        fingerprint: searchFingerprint({ country: 'SN' }),
      }),
    ).toBeNull();
    expect(openSearchCursor(KEY, READER, cursor, { ...position, sort: 'recent' })).toBeNull();
    expect(openSearchCursor(KEY, READER, cursor, { ...position, direction: 'desc' })).toBeNull();
    expect(openSearchCursor('k'.repeat(48), READER, cursor, position)).toBeNull();
    const flipped = `${cursor.slice(0, 5)}${cursor[5] === 'A' ? 'B' : 'A'}${cursor.slice(6)}`;
    expect(openSearchCursor(KEY, READER, flipped, position)).toBeNull();
    expect(openSearchCursor(KEY, READER, 'court', position)).toBeNull();
  });

  it('empreinte : indépendante de l’ordre des clés, sensible aux valeurs', () => {
    expect(searchFingerprint({ a: 1, b: 'x' })).toBe(searchFingerprint({ b: 'x', a: 1 }));
    expect(searchFingerprint({ a: 1 })).not.toBe(searchFingerprint({ a: 2 }));
    expect(searchFingerprint({ a: undefined })).toBe(searchFingerprint({}));
  });
});

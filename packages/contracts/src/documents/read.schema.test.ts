import { describe, expect, it } from 'vitest';
import { documentReadOutputSchema, documentReadParamsSchema } from './read.schema.js';

// Lecture (lot 1.9ca, EX-110 n° 6) : une URL signée et son échéance, rien d'autre.

const valid = {
  url: 'https://s3.example.test/oz-documents/clean/0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192?X-Amz-Signature=ab',
  expiresAt: '2026-11-02T12:05:00.000Z',
};

describe('documentReadOutputSchema', () => {
  it('accepte une URL http(s) et une échéance ISO', () => {
    expect(documentReadOutputSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    { ...valid, url: 'javascript:alert(1)' },
    { ...valid, url: 'file:///etc/passwd' },
    { ...valid, expiresAt: 'demain' },
    { ...valid, storageKey: 'clean/x' },
    { url: valid.url },
  ])('refuse %j', (output) => {
    expect(documentReadOutputSchema.safeParse(output).success).toBe(false);
  });
});

describe('documentReadParamsSchema', () => {
  it('UUID seul', () => {
    expect(
      documentReadParamsSchema.safeParse({ id: '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192' }).success,
    ).toBe(true);
    expect(documentReadParamsSchema.safeParse({ id: 'pas-un-uuid' }).success).toBe(false);
    expect(
      documentReadParamsSchema.safeParse({ id: '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192', x: 1 })
        .success,
    ).toBe(false);
  });
});

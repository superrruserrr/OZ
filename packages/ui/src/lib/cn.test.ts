import { describe, expect, it } from 'vitest';
import { cn } from './cn.js';

describe('cn (classes Tailwind fusionnées)', () => {
  it('garde la dernière couleur de fond OZ en cas de conflit', () => {
    expect(cn('bg-oz-surface-2', 'bg-oz-primary')).toBe('bg-oz-primary');
  });

  it('distingue une couleur de texte OZ d’une taille de texte', () => {
    expect(cn('text-sm text-oz-text-muted', 'text-oz-danger')).toBe('text-sm text-oz-danger');
  });

  it('ignore les valeurs fausses (classes conditionnelles)', () => {
    expect(cn('px-4', false, undefined, null, 'py-2')).toBe('px-4 py-2');
  });
});

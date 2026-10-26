import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@oz/admin', () => {
  it('exporte son nom de paquet', () => {
    expect(PACKAGE_NAME).toBe('@oz/admin');
  });
});

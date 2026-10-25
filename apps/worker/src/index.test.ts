import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.js';

describe('@oz/worker', () => {
  it('exporte son nom de paquet', () => {
    expect(PACKAGE_NAME).toBe('@oz/worker');
  });
});

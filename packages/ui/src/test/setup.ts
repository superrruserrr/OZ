import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans les globales Vitest, Testing Library ne démonte pas les composants entre deux tests.
afterEach(() => {
  cleanup();
});

// Radix Select s'appuie sur la capture de pointeur et le défilement, absents de jsdom.
const missingInJsdom = {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
};
if (typeof Element !== 'undefined') {
  for (const [name, stub] of Object.entries(missingInJsdom)) {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { value: stub, configurable: true });
    }
  }
}

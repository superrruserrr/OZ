import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans les globales Vitest, Testing Library ne démonte pas les composants entre deux tests.
afterEach(() => {
  cleanup();
});

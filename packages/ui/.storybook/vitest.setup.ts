import * as a11yAnnotations from '@storybook/addon-a11y/preview';
import { setProjectAnnotations } from '@storybook/react-vite';
import * as projectAnnotations from './preview.js';

// Applique preview.tsx (dont `a11y.test: 'error'`) et l'addon a11y aux stories rendues par Vitest.
setProjectAnnotations([a11yAnnotations, projectAnnotations]);

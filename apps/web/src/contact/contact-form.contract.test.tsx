import { render, screen } from '@testing-library/react';
import { sendContactMessageSchema } from '@oz/contracts';
import { describe, it } from 'vitest';
import { expectFormMatchesSchema } from '../test/form-contract.js';
import { ContactForm } from './contact-form.js';

describe('ContactForm ↔ sendContactMessageSchema (contrat)', () => {
  it('a exactement les champs du schéma, ni plus ni moins', () => {
    render(<ContactForm onSubmit={() => Promise.resolve()} />);
    expectFormMatchesSchema(
      screen.getByTestId<HTMLFormElement>('contact-form'),
      sendContactMessageSchema,
    );
  });
});

import { render } from '@testing-library/react';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { expectFormMatchesSchema } from './form-contract.js';

const schema = z.strictObject({ name: z.string(), email: z.string() });

function formWith(names: string[]): HTMLFormElement {
  const { container } = render(
    <form>
      {names.map((name) => (
        <input key={name} name={name} />
      ))}
    </form>,
  );
  const form = container.querySelector('form');
  if (!form) throw new Error('formulaire absent');
  return form;
}

describe('expectFormMatchesSchema (EX-T04 n° 4)', () => {
  it('passe quand le formulaire et le schéma ont les mêmes champs', () => {
    expect(() => {
      expectFormMatchesSchema(formWith(['name', 'email']), schema);
    }).not.toThrow();
  });

  it('échoue si le schéma a un champ absent du formulaire', () => {
    expect(() => {
      expectFormMatchesSchema(formWith(['name']), schema);
    }).toThrow(/email/);
  });

  it('échoue si le formulaire a un champ absent du schéma', () => {
    expect(() => {
      expectFormMatchesSchema(formWith(['name', 'email', 'isAdmin']), schema);
    }).toThrow(/isAdmin/);
  });
});

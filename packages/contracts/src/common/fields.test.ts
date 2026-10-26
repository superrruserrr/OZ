import { describe, expect, it } from 'vitest';
import { consent, email, longText, personName } from './fields.js';

describe('briques de contrats', () => {
  it('email : normalise la casse et les espaces, refuse un format invalide', () => {
    expect(email.parse('  Junior.Ngassa@Exemple.CM ')).toBe('junior.ngassa@exemple.cm');
    expect(email.safeParse('pas-un-email').success).toBe(false);
    expect(email.safeParse(`${'a'.repeat(250)}@x.cm`).success).toBe(false);
  });

  it.each(['Éliot Moukoko', "N'Golo Kanté", 'Jean-Pierre Ngassa', 'Ñañez Ü'])(
    'personName accepte « %s »',
    (value) => {
      expect(personName.parse(value)).toBe(value);
    },
  );

  it.each(['Robert1', '<script>', 'a'.repeat(101), '   '])('personName refuse « %s »', (value) => {
    expect(personName.safeParse(value).success).toBe(false);
  });

  it('longText borne la longueur après suppression des espaces de bord', () => {
    const text = longText(20, 2_000);
    expect(text.safeParse('   trop court   ').success).toBe(false);
    expect(text.parse(`  ${'x'.repeat(20)}  `)).toBe('x'.repeat(20));
    expect(text.safeParse('x'.repeat(2_001)).success).toBe(false);
  });

  it('consent n’accepte que true', () => {
    expect(consent.parse(true)).toBe(true);
    for (const value of [false, 'true', 1, undefined])
      expect(consent.safeParse(value).success).toBe(false);
  });
});

describe('briques de contrats : cas internationaux et caractères piégés (revue tour 1)', () => {
  it.each([
    ['forme décomposée (NFD), normalisée en NFC', 'José', 'José'],
    ['apostrophe typographique', 'O’Neil', 'O’Neil'],
    ['initiales avec points', 'J. R. Tolkien', 'J. R. Tolkien'],
    ['hindi (finit par un signe voyelle)', 'सीता', 'सीता'],
    ['persan avec antiliant (ZWNJ)', 'مهر\u200Cناز', 'مهر\u200Cناز'],
    ['nom d’une seule lettre', 'A', 'A'],
  ])('personName accepte : %s', (_, input, expected) => {
    expect(personName.parse(input)).toBe(expected);
  });

  it.each([
    ['empilement de diacritiques (Zalgo)', 'Zé̂̃̄lie'],
    ['caractère de contrôle', 'Jean\u0000Paul'],
    ['inversion bidirectionnelle', 'Jean\u202EluaP'],
    ['tirets successifs', 'Jean--Paul'],
    ['ponctuation seule', "'."],
  ])('personName refuse : %s', (_, input) => {
    expect(personName.safeParse(input).success).toBe(false);
  });

  it.each([
    ['uniquement des espaces invisibles', '\u200B'.repeat(25)],
    ['caractère NUL', `${'x'.repeat(20)}\u0000`],
    ['inversion bidirectionnelle', `${'x'.repeat(20)}\u202E`],
    ['demi-paire de substitution isolée', `${'x'.repeat(20)}\uD800`],
  ])('longText refuse : %s', (_, input) => {
    expect(longText(20, 2_000).safeParse(input).success).toBe(false);
  });

  it('longText garde les retours à la ligne et compte les seuls caractères visibles', () => {
    const text = `Bonjour,\n\nNotre académie souhaite rejoindre OZ.`;
    expect(longText(20, 2_000).parse(text)).toBe(text);
    expect(longText(20, 2_000).safeParse(`a\u200B${'\u200B'.repeat(30)}`).success).toBe(false);
  });

  it('email refuse une partie locale de plus de 64 caractères', () => {
    expect(email.safeParse(`${'a'.repeat(65)}@exemple.cm`).success).toBe(false);
    expect(email.safeParse(`${'a'.repeat(64)}@exemple.cm`).success).toBe(true);
  });
});

describe('briques de contrats : contenu invisible (revue tour 2)', () => {
  it.each([
    ['liants invisibles en série', `A${'\u200D'.repeat(90)}b`],
    ['antiliant en fin de nom', 'Ali\u200C'],
    ['caractère de remplissage coréen', '\u3164\u3164'],
    ['remplissage coréen demi-chasse', 'A\uFFA0b'],
    ['deux diacritiques par lettre, répétés (Zalgo)', 'a\u0301\u0302'.repeat(10)],
  ])('personName refuse : %s', (_, input) => {
    expect(personName.safeParse(input).success).toBe(false);
  });

  it.each(['Nguyễn Thị Ánh', 'स्त्री'])(
    'personName garde un nom réel à diacritiques : %s',
    (name) => {
      expect(personName.parse(name)).toBe(name.normalize('NFC'));
    },
  );

  it('personName garde un antiliant légitime entre deux lettres (persan)', () => {
    expect(personName.parse('مهر\u200Cناز')).toBe('مهر\u200Cناز');
  });

  it.each([
    ['diacritiques isolés', '\u0301'.repeat(25)],
    ['remplissage coréen', '\u3164'.repeat(25)],
    ['espace braille', '\u2800'.repeat(25)],
  ])('longText ne compte pas comme visible : %s', (_, input) => {
    expect(longText(20, 2_000).safeParse(input).success).toBe(false);
  });
});

describe('briques de contrats : marques invisibles et caractères « tag » (revue tour 3)', () => {
  it.each([
    ['joint de graphèmes', 'Ab\u034Fc'],
    ['sélecteur de variante', 'Ab\uFE0Fc'],
    ['sélecteur de variante idéographique', 'Ab\u{E0100}c'],
    ['voyelle khmère invisible', 'A\u17B4b'],
  ])('personName refuse : %s', (_, input) => {
    expect(personName.safeParse(input).success).toBe(false);
  });

  it('longText refuse un texte caché en caractères « tag » Unicode', () => {
    const hidden = '\u{E0049}\u{E0047}\u{E004E}';
    expect(longText(20, 2_000).safeParse(`${'x'.repeat(25)}${hidden}`).success).toBe(false);
  });
});

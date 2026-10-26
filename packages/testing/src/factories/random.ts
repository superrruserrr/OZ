import { base, en, en_GH, en_NG, Faker, fr, fr_SN } from '@faker-js/faker';

/**
 * Générateur à graine fixe : même graine, mêmes données (la version de faker est figée par le lockfile).
 * Noms francophones et anglophones d'Afrique de l'Ouest et d'Europe, repli sur les listes génériques.
 */
export function seededFaker(seed: number): Faker {
  const faker = new Faker({ locale: [fr_SN, en_NG, en_GH, fr, en, base] });
  faker.seed(seed);
  return faker;
}

/** Fragment d'adresse email : minuscules ASCII, sans accents ni espaces. */
export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

import { expect, type Page } from '@playwright/test';
import { syntheticEmail, syntheticPassword } from '../auth/flows.js';
import { logIn, signUpAndConfirm } from './helpers.js';

// Étapes du parcours d'inscription joueur (lot 1.7cb), partagées par les parcours du site.

/** Date de naissance AAAA-MM-JJ d'un joueur de `years` ans révolus. */
export function bornYearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

export async function choose(page: Page, testId: string, option: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Compte créé, confirmé et connecté, à la première étape ; rend le mot de passe synthétique. */
export async function startOnboarding(page: Page): Promise<string> {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await signUpAndConfirm(page, email, password);
  await page.getByTestId('verify-login').click();
  await logIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/identite$/);
  return password;
}

export async function fillIdentity(page: Page, birthDate: string): Promise<void> {
  await page.getByTestId('onboarding-first-name').fill('Awa');
  await page.getByTestId('onboarding-last-name').fill('Ndiaye');
  await page.getByTestId('onboarding-birth-date').fill(birthDate);
  await choose(page, 'onboarding-nationality', 'Cameroun');
  await choose(page, 'onboarding-country', 'Cameroun');
  await page.getByTestId('onboarding-city').fill('Douala');
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/physique$/);
}

export async function fillSport(page: Page): Promise<void> {
  await choose(page, 'onboarding-primary-position', 'Attaquant');
  await page.getByTestId('onboarding-foot-right').click();
  await page.getByTestId('onboarding-height').fill('178');
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/rattachement$/);
}

export async function confirmAffiliation(page: Page, next: RegExp): Promise<void> {
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(next);
}

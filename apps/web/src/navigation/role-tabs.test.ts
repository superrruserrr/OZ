// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fr from '../../messages/fr.json';
import { ROLE_TABS, TAB_ROUTES } from './role-tabs';

// Onglets par rôle (lot 1.5bb, design.md §8.8) : routes de la planche seulement, 5 au plus.

/** Routes de la planche §8.8 (sans paramètre) : aucune autre n'est permise. */
const PLANCHE = new Set([
  '/accueil',
  '/recherche',
  '/messages',
  '/profil',
  '/plus',
  '/shortlist',
  '/academie/effectif',
  '/academie/import',
  '/journal',
  '/federation/observateur',
]);

describe('onglets par rôle', () => {
  it.each(Object.entries(ROLE_TABS))(
    '%s : 1 à 5 onglets, uniques, routes de la planche',
    (_, tabs) => {
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.length).toBeLessThanOrEqual(5);
      expect(new Set(tabs).size).toBe(tabs.length);
      for (const tab of tabs) expect(PLANCHE.has(TAB_ROUTES[tab]), tab).toBe(true);
    },
  );

  it('chaque onglet a son libellé', () => {
    for (const tab of Object.keys(TAB_ROUTES)) {
      expect(fr.nav.tabs[tab as keyof typeof fr.nav.tabs], tab).toBeTruthy();
    }
  });

  it('joueur et recruteur suivent la planche (§8.8)', () => {
    expect(ROLE_TABS.player).toEqual(['home', 'search', 'messages', 'profile', 'more']);
    expect(ROLE_TABS.recruiter).toEqual(['home', 'search', 'messages', 'shortlist', 'more']);
  });

  it('fédération : observateur en lecture seule, sans messages (aucun contact)', () => {
    expect(ROLE_TABS.federation).not.toContain('messages');
    expect(ROLE_TABS.federation[0]).toBe('observer');
  });

  it('tuteur : le journal des consultations est en accès direct', () => {
    expect(ROLE_TABS.guardian).toContain('journal');
  });

  it('les six profils de l’application web ont leurs onglets (l’administrateur est au back-office)', () => {
    expect(Object.keys(ROLE_TABS).sort()).toEqual(
      ['academy', 'center', 'federation', 'guardian', 'player', 'recruiter'].sort(),
    );
  });
});

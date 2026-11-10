/*
 * Onglets par rôle (lot 1.5bb, design.md §8.8). Routes de la planche seulement ; les écrans arrivent
 * avec leurs lots (1.7, 1.13c, 1.14…). Commodité d'affichage : les droits sont appliqués par le
 * serveur, et une route interdite renvoie 404. Écarts à la planche, faute de route définie :
 * académie sans « Rapports » (seul `/rapports/[id]` existe), tuteur sans « Consentements » ni
 * « Signalement », centre réduit à l'accueil en Phase 1 (session, saisie et clôture en Phase 2).
 */
export const TAB_ROUTES = {
  home: '/accueil',
  search: '/recherche',
  messages: '/messages',
  profile: '/profil',
  more: '/plus',
  shortlist: '/shortlist',
  roster: '/academie/effectif',
  import: '/academie/import',
  journal: '/journal',
  observer: '/federation/observateur',
} as const;

export type TabId = keyof typeof TAB_ROUTES;

export type WebRole = 'player' | 'guardian' | 'academy' | 'center' | 'federation' | 'recruiter';

export const ROLE_TABS: Readonly<Record<WebRole, readonly TabId[]>> = {
  player: ['home', 'search', 'messages', 'profile', 'more'],
  recruiter: ['home', 'search', 'messages', 'shortlist', 'more'],
  academy: ['roster', 'import', 'messages', 'more'],
  guardian: ['home', 'journal', 'messages', 'profile', 'more'],
  center: ['home', 'messages', 'more'],
  federation: ['observer', 'search', 'more'],
};

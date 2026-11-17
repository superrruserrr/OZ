# Audit final de la refonte « sport » (lot 1.5cbb)

Date : 2026-11-17. Cadre : [ADR-011](../adr/ADR-011-theme-sombre-unique.md),
[ADR-012](../adr/ADR-012-theme-noir-lime.md), [ADR-013](../adr/ADR-013-premiere-mise-en-ligne-sans-kyc.md).
Exigences : EX-105, EX-T22.

## Contrôles automatiques

| Contrôle                                          | Où                                                    | Pages                                                                                                           | Résultat                                     |
| ------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| axe-core WCAG 2.1 AA à 320 px, pas de débordement | `e2e/web-audit.spec.ts`                               | 12 pages publiques, 8 écrans de compte (connexion fr/en, choix, 2 inscriptions, oubli, réinitialisation, email) | 0 violation                                  |
| Quatre largeurs (1280, 768, 375, 320 px)          | `e2e/web-audit-widths.spec.ts`                        | accueil, tarifs, CGU, connexion, choix du compte, inscription joueur                                            | en-tête et titre visibles, aucun débordement |
| Accroche des écrans de compte à partir de 1024 px | `e2e/web-audit-widths.spec.ts`                        | connexion                                                                                                       | cachée à 375 px, visible à 1280 px           |
| LCP en 3G simulée, p95 sur 5 essais < 2,5 s       | `e2e/web-audit.spec.ts`                               | accueil, connexion                                                                                              | sous le budget                               |
| axe-core des écrans connectés                     | `e2e/web-auth/onboarding.spec.ts`, `guardian.spec.ts` | étapes, bloc mineur, carte OZ ID, invitation, justificatif, accord                                              | 0 violation                                  |
| Couleurs codées en dur                            | `apps/web/src/auth/account-colors.test.ts`            | `auth`, `onboarding`, `guardian` et leurs routes                                                                | aucune                                       |

## Restes de l'ancienne charte

Recherche dans `apps/web/src` et `packages/ui/src` (rose `#EC5C9F`, vert `#9FFE91`, turquoise,
Prompt, `font-bold`, `font-semibold`) : les graisses 600 et 700 des écrans de compte, du tuteur et
des pages d'erreur sont passées à 500 ; les commentaires et l'introduction Storybook qui citaient le
rose et Prompt sont mis à jour. Le jeu clair de `tokens.ts` garde la charte d'origine (mobile et
impression, ADR-011).

## Écarts restants

- Lighthouse n'est pas exécuté en CI ; il est passé en recette (D-129).
- Voir D-137 : bouton d'inscription actif avant validation, textes du tuteur liés au KYC.

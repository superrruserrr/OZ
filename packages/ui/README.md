# @oz/ui

Design system d'OZ : jetons de couleur (`design.md` §8.3), styles de base et composants React partagés
par `apps/web` et `apps/admin` (lots 0.4 et 0.10). Thème sombre natif, WCAG 2.1 AA (TD-008).

## Utiliser

```ts
import { Button, Field, Modal } from '@oz/ui';
```

Les feuilles `@oz/ui/styles/tokens.css` et `base.css` sont importées par `globals.css` de chaque app,
qui déclare aussi `@source` vers `packages/ui/src` pour que Tailwind génère les classes des
composants. Tous les textes arrivent **déjà traduits** par les props : aucun composant ne contient
de libellé.

## Storybook

```bash
pnpm --filter @oz/ui storybook
```

Ouvre http://localhost:6006 (télémétrie coupée). Build statique : `pnpm --filter @oz/ui build-storybook`
(dossier `storybook-static/`, publié en artefact par la CI).

## Tester

| Commande                    | Contenu                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @oz/ui test` | Tests unitaires (jsdom), compris dans `pnpm test`                                                                                  |
| `pnpm test:stories`         | Chaque story dans Chromium : interactions `play`, axe-core WCAG 2.1 AA bloquant, replis `prefers-reduced-motion` (projet `motion`) |

Prérequis de `test:stories` : `pnpm exec playwright install chromium`.

## Ajouter un composant

1. Tests d'abord : `src/components/<nom>.test.tsx` (comportement, attributs ARIA, contrastes via
   `contrastRatio`).
2. Composant dans `src/components/<nom>.tsx` : primitive Radix si l'interaction est complexe,
   variantes avec `cva`, classes fusionnées par `cn`, couleurs uniquement par les classes `oz-*`
   (aucune valeur hexadécimale ou `rgb()` hors `tokens.ts`, vérifié par test).
3. Story par état dans `<nom>.stories.tsx` (repos, focus, désactivé, erreur, chargement) ; un `play`
   pour chaque interaction clavier.
4. Export dans `src/index.ts`.

## Règles

- Le vert ne s'allume que lorsque l'action est possible ; bleu = cadre légal (`legal-text` pour le
  texte), ambre = niveau KYC, rouge = danger seulement (`design.md` §8.4).
- Effets animés : `transform` et `opacity` (et couleur du contour) seulement ; ombre et mise à
  l'échelle sous `motion-safe:`.
- `data-testid` selon `naming_conventions.md` : `modal-{name}`, `modal-{name}-submit`,
  `badge-{status}`, `notification-{tone}`.
- Exemples des stories : ni mineur mis en avant, ni chiffre fictif présenté comme réel, ni marque
  tierce (`design.md` §8.10).

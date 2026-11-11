# ADR-011 : Thème sombre unique pour le web, direction « sport » de la maquette Manus

Statut : Accepté
Date : 2026-11-10 · Décideurs : Gaëtan Wassu

## Contexte

L'ADR-009 a posé la charte OZ Football ID avec un mode clair par défaut et un mode sombre selon le
réglage de l'appareil. Le 2026-11-10, Gaëtan Wassu a fourni une maquette haute fidélité (prototype
Manus « OZ Football ID », hors dépôt) et demandé que tout le site lui ressemble : une interface de
sport, dans l'esprit des applications de paris sportifs (fond nuit de stade, cartes vitrées, effets),
responsive sur ordinateur, tablette et téléphone.

La maquette n'existe qu'en sombre, avec un vert lime `#B8FF2C` et la police Inter. Elle affiche aussi
un « OZ Index », des joueurs mineurs classés publiquement et des chiffres fictifs, que le plan
interdit (Q18, EX-T16, M3, M5).

Sources : ADR-009 ; `design.md` §8.2 à §8.10 ; `requirements.md` EX-105, EX-106, EX-T16, EX-T22 ;
plan de lot `phase1.5ca_plan.md`.

## Options envisagées

1. **Garder clair par défaut et sombre selon l'appareil** — aucun changement, mais le site ne
   ressemble pas à la maquette pour la majorité des visiteurs, réglés en clair.
2. **Sombre sur le site public, clair ou sombre ailleurs** — l'ambiance sport à l'accueil, mais deux
   identités à maintenir et une rupture visuelle à la connexion.
3. **Sombre partout sur le web** — une seule identité, la plus proche de la maquette ; le jeu clair
   reste défini pour le mobile et l'impression.

## Décision

Option 3, choisie par Gaëtan Wassu le 2026-11-10, avec trois réserves qu'il a validées :

- **Couleurs et police de la charte**, pas celles de la maquette : le lime devient le vert d'action
  `primary` (`#9FFE91` en sombre), les mots d'accroche passent en rose `accent`, le bleu de la
  maquette en turquoise `highlight`, l'ambre en `kyc`, le rouge en `danger`. Prompt remplace Inter.
  **Remplacée par [ADR-012](ADR-012-theme-noir-lime.md) : noir, lime `#C6FF3D`, bleu,
  ambre et police système type Helvetica ; le reste de cette décision est maintenu.**
- **On reprend de la maquette** la mise en page (héros plein écran et carte latérale, bandeaux de
  valeur, cartes de rôle, pages d'authentification en deux colonnes, coquille rail latéral + barre du
  haut + onglets bas), les cartes vitrées et les effets.
- **Les règles du plan restent** : pas de score de joueur, aucun mineur mis en avant, aucun chiffre
  fictif, français par défaut et anglais.

`packages/ui/styles/tokens.css` ne pose plus que le jeu sombre, sans `prefers-color-scheme` ; le
logo sert toujours sa version fond sombre ; `viewport.colorScheme` vaut `dark` sur le site et le
back-office, qui partagent les jetons.

## Conséquences

- Amende l'ADR-009 sur le mode seulement ; la palette, la typographie et les règles de sens
  (`design.md` §8.4) sont inchangées.
- Les contrastes AA ne sont plus vérifiés que pour le jeu servi (sombre) côté web ; le jeu clair
  reste testé dans `contrast.test.ts` pour le mobile.
- Le back-office passe aussi en sombre (jetons partagés) ; ses écrans restent en registre Pilotage.
- La refonte se fait en deux lots : 1.5ca (jetons, composants, coquille dans `@oz/ui`) puis 1.5cb
  (pages de `apps/web`). Les espaces des lots futurs prendront ce style à leur tour.
- Le néon lime (E17) reste retiré ; le halo des boutons utilise le vert de la charte.
- Le héros reste sans photo de joueur tant qu'une photo libre de droits n'est pas fournie (D-129).

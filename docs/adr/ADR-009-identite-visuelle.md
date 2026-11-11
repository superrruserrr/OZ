# ADR-009 : Identité visuelle — charte OZ Football ID, mode clair et mode sombre

Statut : Accepté
Date : 2026-11-10 · Décideurs : Gaëtan Wassu

## Contexte

Le document de projet (§12.2) décrit deux univers visuels, doré et sombre (émotion) et vert et sombre
(institutionnel), et demande de les faire converger (question Q6). Les maquettes `EX CHART/` ont
servi de base au lot 0.10 : thème sombre seul, lime néon, émeraude, police Inter (`design.md` §8,
TD-008). Le nom du produit restait ouvert entre « OZ FOOTBALL ID » et « OZ FOOTBALL OS » (Q19).

En novembre 2026, OZ a livré sa charte graphique v1.0 « OZ FOOTBALL ID — Beyond potential » (PDF hors
du dépôt, sous NDA) : logo à empreinte digitale, couleurs du logo (rose `#EC5C9F`, turquoise
`#06BAF0`, vert clair `#9FFE91`, noir `#1D1D1B`, blanc `#F9F9F9`), palette de communication en mode
clair et en mode sombre, police unique Prompt, tailles web.

Sources : `requirements.md` EX-105 n° 1 et 2, EX-T22 ; `design.md` §8.2 à §8.5 ; TD-008 ; plan
d'implémentation, phase 1.5 tâche 1.

## Options envisagées

1. **Charte appliquée en clair et en sombre** — clair par défaut, sombre selon le réglage de
   l'appareil, mêmes noms de jetons. Avantages : fidèle à la charte (qui décrit les deux modes),
   lisible en plein soleil sur le terrain (compromis noté dans TD-008), aucun composant à renommer.
   Inconvénients : chaque écran doit être vérifié dans les deux modes.
2. **Charte en sombre seulement** — moins de travail. Inconvénient : écarte la version principale de
   la charte (fond blanc) et garde le défaut de lisibilité en extérieur.
3. **Garder la direction des maquettes** — aucun travail. Inconvénient : contredit la marque livrée.

## Décision

Option 1.

- Nom du produit : **OZ FOOTBALL ID** (Q19). Le logo n'est jamais recomposé en texte : quatre
  fichiers (horizontal pour grand écran, empilé sous 640 px, chacun pour fond clair et fond sombre),
  choisis par le navigateur sans JavaScript (`@oz/ui/logo`).
- Un seul système (Q6) : les deux registres de `design.md` §8.2 restent, recolorés par la charte. Le
  rose remplace le lime et le néon pour l'accroche ; le vert reste la couleur d'action ; pas d'or
  décoratif. Les règles de sens (§8.4 : vert action, bleu tuteur, ambre KYC, rouge bloquant) sont
  inchangées.
- Mode clair par défaut, mode sombre par `prefers-color-scheme` ; pas de bascule manuelle à ce stade.
  **Amendé par [ADR-011](ADR-011-theme-sombre-unique.md) : le web n'a plus qu'un thème, sombre.**
- Police : Prompt 400 et 700, auto-hébergée (latin et latin-ext) ; JetBrains Mono conservée pour les
  OZ ID et les codes.
  **Amendé par [ADR-012](ADR-012-theme-noir-lime-montserrat.md) : l'interface passe en noir, lime
  `#C6FF3D` et Montserrat ; logo, nom et règles de sens inchangés.**
- Écarts à la charte imposés par l'AA (EX-T22) : vert d'action `#187A34` au lieu de `#1E8E3E` en
  clair, rose réservé aux grands titres, jaune et rouge assombris en clair, bleu légal conservé. Les
  valeurs exactes sont dans `design.md` §8.3, vérifiées par `packages/ui/src/contrast.test.ts`.

## Conséquences

- TD-008 passe de « sombre natif » à « clair et sombre ».
- Les composants `@oz/ui` gardent leurs classes `oz-*` ; `lime` disparaît au profit de `accent` (rose)
  et `highlight` (turquoise, jamais pour du texte).
- Tout nouvel écran est testé dans les deux modes (axe-core en E2E).
- Les logos sont des PNG détourés tant que les fichiers vectoriels ne sont pas fournis (dette D-126).
- Le slogan des fichiers fournis porte « Beyong potential » ; OZ a tranché le 2026-11-10 pour
  « Beyond potential » (Q24) : fichiers corrigés à obtenir du graphiste avant toute impression, les
  PNG du dépôt gardent la coquille d'ici là (D-126).

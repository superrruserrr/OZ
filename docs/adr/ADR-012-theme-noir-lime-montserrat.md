# ADR-012 : Thème « Workspace » — noir, lime et Montserrat

Statut : Accepté
Date : 2026-11-10 · Décideurs : Gaëtan Wassu

## Contexte

L'ADR-009 a posé la charte OZ Football ID : rose `#EC5C9F`, turquoise, vert d'action `#9FFE91`,
police Prompt. L'ADR-011 a rendu le web sombre partout et a écarté le lime `#B8FF2C` et la police
Inter de la maquette Manus.

Le 2026-11-10, Gaëtan Wassu a fourni deux captures d'un espace connecté « OZ Workspace » : le tableau
de bord d'une académie et le bureau de recherche d'un recruteur. Il a demandé que tout l'univers
suive ce thème. Il a aussi demandé des cadres pour les photos, les publicités et les statistiques,
et a donné comme référence de style le projet Behance « Football Stat App » (Alex Kataev, 2016),
avec la même police. Le fichier de design Claude Design « OZ Football ID — Design » applique déjà
ce thème sur seize planches.

Ce thème contredit l'ADR-009 sur la palette et la police, et l'ADR-011 sur sa première réserve. Les
captures montrent aussi un « OZ index » par joueur, des joueurs U15 à U17 listés pour des recruteurs
et des chiffres présentés comme réels, que le plan interdit (Q18, EX-T16, M3, M5).

Sources :

- ADR-009 et ADR-011 ;
- `design.md` §8.2 à §8.10 ;
- `requirements.md` EX-105, EX-106, EX-T16, EX-T22 ;
- le fichier de design Claude Design (planches « Système », « Kit — cadres », « Espace académie »,
  « Recherche recruteur »).

## Options envisagées

1. **Garder la charte de l'ADR-009 et ne reprendre que la mise en page des captures.** La marque
   livrée reste intacte, mais le résultat ne ressemble pas à ce que Gaëtan Wassu a demandé.
2. **Adopter le thème des captures pour l'interface, garder le logo officiel.** Le résultat est
   fidèle à la demande et reste une seule identité, sombre. En contrepartie, la palette de l'interface
   s'écarte de la charte PDF : le rose et le turquoise sortent de l'interface et la police change.
3. **Deux thèmes**, la charte pour le site public et le thème des captures pour les espaces
   connectés. On garde ainsi la marque à l'accueil, mais avec deux identités à maintenir et une rupture
   visuelle à la connexion, ce que l'ADR-011 voulait déjà éviter.

## Décision

Option 2, choisie par Gaëtan Wassu le 2026-11-10, pour le site, les espaces connectés et le
back-office.

### Couleurs

Le web reste sombre partout (ADR-011). Les noms des jetons `--oz-*` ne changent pas, seules leurs
valeurs changent :

| Rôle                         | Jeton                              | Valeur                          |
| ---------------------------- | ---------------------------------- | ------------------------------- |
| Fond                         | `bg`                               | `#0A0D0E`                       |
| Surfaces                     | `surface-1`, `surface-2`           | `#101517` et `#172023`          |
| Champ de saisie              | `surface-input`                    | `#0E1315`                       |
| Bordure                      | `border`                           | `#222B2E`                       |
| Texte                        | `text`, `text-muted`, `text-label` | `#F2F5F3`, `#9AA4A6`, `#8A9496` |
| Action, état actif, série 1  | `primary`                          | lime `#C6FF3D`                  |
| Texte sur lime               | `on-primary`                       | `#0A0D0E`                       |
| Info, série 2                | `highlight`                        | bleu `#7AA7FF`                  |
| Identité en attente, série 3 | `kyc`                              | ambre `#FFD36B`                 |
| Blocage, carton rouge        | `danger`                           | `#FF6B5E`                       |

- **Rose** : `accent` prend la valeur du lime. Le rose ne sert plus dans l'interface.
- **Tuteur légal** : le bleu `legal` reste distinct, pour garder la règle de sens de `design.md` §8.4.

### Police

Montserrat (licence SIL OFL), servie par `next/font` sans appel réseau au chargement, remplace Prompt :

- affiche en capitales : graisse 900 ;
- titres : graisse 800 ;
- texte courant : graisses 400 à 600 ;
- libellés : 11-12 px, graisse 800, espacement 0,14em.

### Composants

On reprend des captures et de la référence Behance :

- le rail « Pilotage » avec le sélecteur d'espace ;
- le bandeau de vérification ;
- les chiffres clés avec mini-courbes, la courbe de visibilité et l'anneau de répartition ;
- le tableau de recherche avec ses signaux ;
- le terrain des postes occupés et la courbe de progression ;
- le tableau de saison.

S'y ajoute un kit de cadres :

- photo aux formats 4:5, 16:9, 1:1 et 9:16 ;
- publicité aux formats IAB 728×90, 300×250 et 320×100, plus une carte native, toujours marquée
  « Sponsorisé » ;
- statistiques.

### Ce qui ne change pas

- **Logo** : le logo officiel de l'ADR-009 (fichiers fond sombre) est maintenu. Le « OZ » en
  italique des captures n'est qu'une silhouette de maquette.
- **Règles du plan** :
  - aucun indice ni score de joueur ; la colonne « OZ index » devient « Saisons certifiées » ;
  - aucun mineur listé, classé ou mis en avant ; la recherche des recruteurs est limitée aux profils
    majeurs qui l'ont choisi ;
  - aucun chiffre fictif présenté comme réel ;
  - aucun logo de partenaire sans accord écrit ;
  - français par défaut, puis anglais.

## Conséquences

- **ADR-009** : amendé sur la palette et la police de l'interface. Le nom du produit, le logo et les
  règles de sens restent valables. La charte PDF reste la référence pour les supports imprimés et la
  communication.
- **ADR-011** : sa première réserve (« couleurs et police de la charte ») est remplacée. Le reste de
  sa décision est maintenu : sombre partout, mise en page sport, règles du plan.
- **Lot 1.5cc** (jetons, police et composants de `@oz/ui`) :
  - mettre à jour `tokens.css`, `tokens.ts`, `contrast.test.ts` et `design.md` §8 ;
  - charger Montserrat ;
  - ajouter les composants de statistiques (mini-courbe, anneau, terrain) et le kit de cadres.
    Il passe avant le lot 1.5cb, qui applique le style aux pages de `apps/web`.
- **Accessibilité** : chaque paire texte sur fond doit repasser le contrôle de contraste AA du lot.
  Le lime ne porte jamais de texte de petite taille sur fond clair, et le texte posé sur le lime est
  toujours `#0A0D0E`.
- **Graphiques** : les séries suivent l'ordre lime, bleu, ambre, puis gris. Deux séries comparées
  diffèrent aussi par la clarté, pas seulement par la teinte.
- **Publicité** : les emplacements publicitaires sont dessinés, mais aucune régie n'est choisie.
  Leur activation demandera un ADR à part (consentement, CSP, performance).

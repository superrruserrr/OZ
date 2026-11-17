# ADR-013 : Première mise en ligne sans KYC, back-office réduit avant le lot 1.10

Statut : Accepté
Date : 2026-11-17 · Décideurs : Gaëtan Wassu

## Contexte

Le plan d'exécution ([PLAN.md](../PLAN.md) §9) fixe le chemin critique de la Phase 1 :
`1.1 → 1.3 → 1.4 → 1.9 → 1.10 → 1.11 → 1.17 → 1.18`. Le back-office (1.11) suit la vérification
d'identité (1.10), et la mise en production (1.18) suit les deux.

Au 2026-11-17, le lot 1.10 est en pause : il attend l'analyse d'impact (AIPD) relue par le juriste et
le choix du prestataire d'identité (TD-015). Le reste de la chaîne d'inscription est livré : joueur
(1.7), tuteur légal avec justificatif et accord (1.7b), coffre documentaire (1.9), journal d'audit et
RGPD (1.16), fiche et recherche côté serveur (1.13a, 1.13b, 1.14a, 1.14b).

Attendre 1.10 pour ouvrir bloquerait toute mise en ligne pendant une durée que l'équipe ne maîtrise
pas.

Sources :

- `docs/PLAN.md` §8 (lots 1.10, 1.11, 1.15, 1.17, 1.18), §9 ;
- `implementation_plan.md` §4 et §9 ;
- `docs/CONFORMITE.md` (C1 à C9, validées le 2026-11-17) ;
- `requirements.md` EX-108, EX-111, EX-113, EX-117, EX-124.

## Options envisagées

1. **Suivre le plan** : attendre l'AIPD relue et le prestataire, livrer 1.10 puis 1.11, puis ouvrir.
   Conforme au plan, mais la date d'ouverture dépend de tiers.
2. **Ouvrir sans KYC, avec un back-office réduit** : inscriptions joueur et tuteur, tableaux de bord,
   emails essentiels ; aucun badge « Profil vérifié » ; 1.10 reporté après l'ouverture. On ouvre plus
   tôt, au prix d'un écart au chemin critique et d'un produit sans preuve d'identité.
3. **Ouvrir avec une vérification manuelle des pièces par l'administrateur** en attendant le
   prestataire. Badge possible plus tôt, mais vérification non outillée, charge humaine forte et
   risque de badge accordé à tort (contraire à l'objectif de 1.10).

## Décision

Option 2, validée par Gaëtan Wassu le 2026-11-17. **C'est un écart assumé au chemin critique du plan
(1.10 → 1.11).**

Périmètre de la première mise en ligne :

- inscription du joueur et du tuteur légal ;
- tableaux de bord du joueur (fiche, visibilité, export et suppression), du tuteur et de
  l'administrateur ;
- emails essentiels (1.15 minimal) ;
- hébergement de test et de production (0.8c, 0.8d) et surveillance (0.9) ;
- recette (1.17), puis mise en production (1.18).

Règles maintenues pendant cette période :

- **aucun badge « Profil vérifié »**, aucun libellé qui le laisse croire ;
- **la fiche d'un mineur reste cachée** tant que son tuteur n'est pas validé par justificatif
  (lot 1.7b, examen par un administrateur) ; décision du 2026-11-17 (D-137) : elle est publiée quand
  le justificatif du tuteur est validé **et** que le tuteur a donné son accord, sans attendre le
  KYC 2 ; le serveur et les textes du tuteur sont adaptés au lot 1.19 ;
- les droits de l'Annexe B et les règles des lots 1.14 (aucun mineur pour un recruteur ou une agence
  non vérifiés) restent appliqués.

Nouvel ordre des lots :

1. 1.5cbb — refonte : connexion, choix du compte, inscription, premiers pas, audit final ;
2. **1.19 Ouverture** (regroupement décidé le 2026-11-17 : un seul lot, plusieurs PR de 800 lignes
   au plus) :
   - 1.13c étendu — tableau de bord du joueur : fiche, visibilité, export et suppression ;
   - 1.7d — tableau de bord du tuteur ;
   - 1.11 réduit — comptes, examen des justificatifs de tuteur, journal d'audit, suspension ;
   - 1.15 minimal — emails essentiels ;
3. 0.8c, 0.8d et 0.9 — hébergement de test et de production, surveillance ;
4. 1.17, puis 1.18.

Après l'ouverture : 1.10, 1.10b, puis le reste de 1.11 (file KYC, quatre yeux sur les décisions KYC,
tableau de bord opérationnel), 1.8, 1.12, 1.14 (écrans).

Prérequis hors code, avant l'ouverture :

- relecture par le juriste de l'AIPD (`docs/security/aipd.md`) et des CGU et de la politique de
  confidentialité (`docs/legal/`, Q7) ;
- test d'intrusion externe, recommandé, en plus du test interne de 1.17.

## Conséquences

- Le jalon J2 est découpé : une première ouverture sans KYC, puis J2 complet quand 1.10, 1.10b et
  1.11 complet sont livrés et que les critères du §11 de `implementation_plan.md` sont atteints.
- Le lot 1.11 est scindé : **1.11 réduit** avant l'ouverture, **1.11 complet** après 1.10.
- La confiance repose sur le déclaratif ; les textes publics le disent, sans promesse de
  vérification.
- Les parcours E2E qui dépendent du KYC (n° 5, n° 6) attendent 1.10 ; la recette 1.17 porte sur le
  périmètre ouvert.
- `implementation_plan.md` §4 et §9 et `docs/AVANCEMENT.md` reprennent cet ordre.

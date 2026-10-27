# ADR-007 : UUIDv7 comme identifiant technique, OZ ID comme identifiant métier

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

OZ a deux besoins d'identification qui s'opposent. La base a besoin de clés techniques uniques,
efficaces à indexer et qui ne révèlent rien (aucun entier séquentiel exposé, [plan §5.1](../PLAN.md)).
Les personnes ont besoin d'un identifiant à vie, dictable au téléphone, vérifiable hors ligne,
jamais réattribué, et qui ne révèle pas le nombre d'inscrits (§5.3). Le plan prévoyait un checksum
« mod 37 », dont les symboles supplémentaires sont incompatibles avec un alphabet dictable sans U
(Q4, tranchée par TD-017).

Sources : plan §5.1, §5.3, [technology_decisions.md TD-017](../../technology_decisions.md),
`requirements.md` EX-102 et Q4, Q17, fonction `oz_uuid_v7()` de la migration initiale (lot 0.6).

## Options envisagées

1. **UUIDv7 technique + OZ ID métier distinct** — UUIDv7 ordonné dans le temps (index B-tree
   efficaces), opaque ; OZ ID `OZ-CM-26-7K4M9Q-3` réservé au métier. Inconvénients : deux
   identifiants à maintenir, table de registre pour l'OZ ID.
2. **OZ ID comme clé primaire** — un seul identifiant. Inconvénients : clé métier exposée partout,
   format figé dans toutes les clés étrangères, changement impossible.
3. **UUIDv4 + OZ ID** — standard. Inconvénients : insertion aléatoire dans les index, fragmentation à
   volume élevé, sans bénéfice par rapport à v7.

## Décision

- Toute table a pour clé `id UUID` générée par `oz_uuid_v7()` (UUIDv7) ; aucun entier séquentiel
  n'est exposé.
- L'OZ ID est l'identifiant métier, au format `OZ-CM-26-7K4M9Q-3` : préfixe `OZ`, pays ISO 3166-1
  alpha-2, année d'émission sur deux chiffres, six caractères base 32 Crockford (sans I, L, O, U) et
  un caractère de contrôle. Le contrôle est l'**algorithme de Damm** sur l'alphabet Crockford,
  calculé sur l'identifiant entier sans tirets (TD-017) : il détecte toutes les erreurs sur un
  caractère et toutes les inversions de deux caractères voisins. La table de quasigroupe d'ordre 32
  est figée à vie dans `packages/core`, avec une empreinte SHA-256 vérifiée par test.
- L'OZ ID est réservé atomiquement, immuable, jamais réattribué, y compris après suppression du
  compte (EX-102, lot 1.2).

## Conséquences

- Positives : clés techniques opaques et performantes ; identifiant humain lisible, vérifiable sans
  réseau, indépendant du schéma.
- Négatives : le format §5.3 du plan mentionne encore « mod 37 », remplacé par TD-017 ; les
  maquettes affichent un autre format (Q17) et sont à corriger ; la table de Damm ne peut plus
  changer une fois des OZ ID émis.
- Ce que cela ferme : toute modification du format après la première émission. Ce que cela ouvre :
  QR du profil et vérification hors ligne sur le terrain.
- Retour arrière : avant la première émission en production, le format peut encore évoluer par un
  nouvel ADR ; après, seule une nouvelle génération de format (préfixe distinct) serait possible,
  les anciens OZ ID restant valides.

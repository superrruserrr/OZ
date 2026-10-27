# ADR-005 : Stratégie de recherche progressive (plein texte PostgreSQL, puis moteur dédié)

Statut : Proposé
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

La recherche de profils est au cœur de l'offre (recruteurs, académies, fédérations). En Phase 1, le
volume reste modeste et la recherche doit respecter le cloisonnement par rôle et la protection des
mineurs ([plan §3.5, §6.7](../PLAN.md)) : un index externe dupliquerait des données sensibles hors de
la base et hors de la RLS. Le plan prévoit un moteur dédié plus tard, sans le complexifier avant d'en
avoir besoin (§4.2, lot 3.1).

Sources : plan §4.2 (« Recherche avancée »), §8 lot 3.1 ; `requirements.md` EX-116 (p95 < 300 ms
sur 100 000 profils synthétiques) et EX-301 (bascule au-delà de 200 000 profils ou d'un p95 de
300 ms) ; [technology_decisions.md TD-002](../../technology_decisions.md).

## Options envisagées

1. **PostgreSQL d'abord (FTS + `pg_trgm` + `unaccent`), Meilisearch ensuite** — aucune
   infrastructure supplémentaire, la RLS et les vues filtrées s'appliquent à la recherche, tolérance
   aux accents et aux fautes par trigrammes. Inconvénients : pertinence et facettes plus limitées,
   index à surveiller. Coût : nul en Phase 1-2.
2. **Meilisearch dès la Phase 1** — pertinence, tolérance aux fautes, facettes. Inconvénients : un
   service de plus à sécuriser et sauvegarder, copie des données hors de la base, filtrage par rôle à
   réimplémenter dans l'index, synchronisation à maintenir.
3. **OpenSearch / Elasticsearch** — très puissant. Inconvénients : lourd à opérer, coûteux, sans
   rapport avec le volume attendu.

## Décision

Proposée : recherche en PostgreSQL en Phases 1 et 2 (`search_vector` + index GIN, trigrammes,
`unaccent`, extensions installées au lot 0.6, index posés au lot 1.1), derrière une interface de
recherche du module dédié pour que le moteur soit remplaçable. Bascule vers Meilisearch au lot 3.1,
ou plus tôt si l'un des deux seuils est franchi en production : plus de 200 000 profils, ou p95 de
recherche au-delà de 300 ms.

Statut « Proposé » : les seuils sont ceux du plan ; ils seront confirmés par la mesure (k6, lot 1.8)
avant d'accepter l'ADR.

## Conséquences

- Positives : aucune donnée de mineur dupliquée hors de PostgreSQL en Phase 1-2 ; une seule source
  de vérité pour les droits ; coût nul.
- Négatives : pertinence moindre qu'un moteur dédié ; la migration du lot 3.1 demandera une
  synchronisation incrémentale et un filtrage par rôle dans l'index.
- Ce que cela ferme : un index externe en Phase 1. Ce que cela ouvre : un moteur dédié branché
  derrière la même interface.
- Retour arrière : l'interface de recherche isole le moteur ; revenir au plein texte PostgreSQL
  consiste à rebrancher l'implémentation d'origine, les index restant dans la base.

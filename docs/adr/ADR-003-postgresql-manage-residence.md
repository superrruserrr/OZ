# ADR-003 : PostgreSQL managé, résidence des données à Paris

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

Les données d'identité sont fortement relationnelles et exigent des contraintes d'intégrité, la Row
Level Security et le chiffrement colonne ([plan §4.2, §5.1](../PLAN.md)). Elles concernent des mineurs
et sont transmises à des destinataires européens (RGPD, §6.8). Le plan exige un RPO de 15 min, un
RTO de 4 h et une restauration testée chaque mois (§6.9). L'équipe est réduite : l'exploitation de la
base (sauvegardes WAL, restauration, mises à jour) est l'opération la plus risquée.

Sources : [technology_decisions.md TD-002, TD-009, TD-019](../../technology_decisions.md), plan §4.2,
§5.1, §6.8, §6.9, §10.

## Options envisagées

1. **PostgreSQL 16 managé, Scaleway (Paris)** — sauvegardes automatiques, haute disponibilité en
   production, réseau privé, un seul fournisseur européen (un seul accord de sous-traitance).
   Inconvénients : coût supérieur à l'auto-hébergement, dépendance à un fournisseur. Coût : abonnement
   mensuel selon la taille (§10.3).
2. **PostgreSQL managé, OVHcloud (France)** — équivalent fonctionnel. Inconvénients : deuxième
   fournisseur à côté des instances et du stockage, deux contrats.
3. **PostgreSQL auto-hébergé (Hetzner ou instance)** — le moins cher. Inconvénients : sauvegardes,
   WAL, restauration et mises à jour à notre charge sur des données de mineurs.

## Décision

PostgreSQL 16 managé chez Scaleway, région Paris (fr-par), en recette comme en production : sans
point d'accès public, joint par réseau privé en TLS épinglé sur l'autorité de l'instance
(`verify-ca`), rôles distincts pour l'application et les migrations, secrets en écriture seule
(TD-019, lot 0.8b). Les données personnelles restent dans l'Union européenne.

## Conséquences

- Positives : la plateforme ne porte pas l'exploitation de la base ; résidence UE simple à
  démontrer ; infrastructure décrite en Terraform et testée.
- Négatives : le RPO de 15 min n'est pas encore garanti (DEBT D-035) ; recette et production ne sont
  pas appliquées tant que la mise en ligne est reportée (D-051, D-036) ; isolation des buckets dans
  un projet partagé (D-040).
- Ce que cela ferme : un SGBD non relationnel (§4.4). Ce que cela ouvre : RLS et `pgcrypto` au lot
  1.1, recherche plein texte jusqu'à la bascule de l'ADR-005.
- Retour arrière : PostgreSQL standard, migrations Prisma versionnées et réversibles, Terraform —
  un changement d'hébergeur passe par un dump et une restauration, sans changement d'application.

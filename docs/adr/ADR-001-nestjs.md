# ADR-001 : NestJS plutôt que Fastify ou Express nu

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

L'API d'OZ porte le cœur de valeur : identités vérifiées, KYC, cloisonnement par rôle. Le plan
découpe le domaine en modules (bounded contexts, [plan §3.4](../PLAN.md)) menés par deux chaînes de
travail en parallèle (§2.1, §9). Le monolithe modulaire est imposé, les microservices sont écartés
(§4.4). Le même langage doit couvrir le formulaire, l'API et la base (TypeScript strict, R5), et le
contrat d'API est publié en OpenAPI (§4.2, EX-T04).

Sources : [technology_decisions.md TD-001](../../technology_decisions.md), plan §3.4, §4.2, §4.4.

## Options envisagées

1. **NestJS** — modules, injection de dépendances, garde-fous (guards, pipes, interceptors) et
   génération OpenAPI intégrés ; structure qui épouse les bounded contexts. Inconvénients : plus de
   « cérémonie » (décorateurs, modules), démarrage un peu plus lent. Coût : nul (MIT).
2. **Fastify nu** — très rapide, validation par schéma native. Inconvénients : architecture,
   injection de dépendances et conventions de module à inventer et à faire respecter à la main.
   Coût : nul, mais temps de conception.
3. **Express nu** — minimal et universel. Inconvénients : aucune structure, middleware non typés,
   tout le socle (validation, erreurs, OpenAPI) à assembler. Coût : nul, mais temps de conception.

## Décision

NestJS 12, en ESM, sur Node.js 24 LTS. La modularité imposée correspond aux bounded contexts et permet
aux deux chaînes de travailler sans collision ; les garde-fous transverses (validation Zod, format
d'erreur normalisé, `X-Request-Id`, en-têtes de sécurité) sont posés une fois pour toute l'API
(lot 0.3).

## Conséquences

- Positives : un module par contexte, dépendances explicites et testables ; OpenAPI produit depuis le
  code (`/docs` hors production) ; contrôle d'accès centralisé dans des guards (lot 1.4).
- Négatives : courbe d'apprentissage des décorateurs ; métadonnées à l'exécution (réflexion) ;
  dépendance aux versions majeures de NestJS, suivies par Dependabot sans fusion automatique.
- Ce que cela ferme : un serveur HTTP « fait main ». Ce que cela ouvre : workers BullMQ et modules
  partagés dans le même cadre.
- Retour arrière : NestJS peut tourner sur l'adaptateur Fastify sans réécrire les modules ; la logique
  métier vit dans `packages/core` sans dépendance à NestJS, ce qui borne le coût d'un changement de
  cadre au câblage HTTP.

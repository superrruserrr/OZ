# ADR-004 : Zod comme contrat unique de validation

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

Le plan impose une double vérification client / serveur ([plan §7.1-§7.2](../PLAN.md)) : le client
valide pour le confort, le serveur décide. Si les règles sont écrites deux fois, elles divergent, et
une divergence sur une date de naissance ou un format d'identité est une faille. L'API et les
applications web partagent TypeScript (ADR-001) et le contrat d'API est publié en OpenAPI (EX-T04).

Sources : [technology_decisions.md TD-003](../../technology_decisions.md), plan §7.1, §7.2, exigences
EX-T04, lot 0.5 (`packages/contracts`).

## Options envisagées

1. **Zod, schémas partagés dans `@oz/contracts`** — un schéma sert au formulaire (React Hook Form), au
   pipe de validation de l'API et à la génération OpenAPI ; types TypeScript inférés. Inconvénients :
   bibliothèque d'exécution côté client (poids), dépendance à son évolution. Coût : nul (MIT).
2. **class-validator + DTO NestJS** — natif dans NestJS. Inconvénients : non partageable tel quel avec
   le navigateur, règles dupliquées côté formulaire.
3. **JSON Schema (Ajv)** — standard, rapide. Inconvénients : schémas verbeux, types TypeScript à
   générer, erreurs moins lisibles pour les formulaires.

## Décision

Zod est le seul langage de validation. Les schémas vivent dans `@oz/contracts`, avec des briques
réutilisables (`email`, `personName`, `longText`, `consent`) et des conventions vérifiées par test
(`scripts/contracts-conventions.test.mjs`). Côté API, `ZodValidationPipe` et `@ValidatedBody`
refusent toute requête invalide en 422 avant la logique, champ inconnu compris ; côté web, le même
schéma pilote le formulaire. Un test de contrat formulaire ↔ schéma est obligatoire (lot 0.5).

## Conséquences

- Positives : une seule définition par règle ; une évolution de schéma casse la compilation des deux
  côtés au lieu de diverger en silence ; documentation OpenAPI alignée.
- Négatives : toute modification de `@oz/contracts` touche les deux chaînes de travail et doit être
  annoncée avant d'être poussée (`implementation_plan.md` §1.3) ; poids de Zod dans le bundle client.
- Ce que cela ferme : les validations ad hoc dans les contrôleurs. Ce que cela ouvre : contrats
  réutilisables par l'application mobile (Phase 2).
- Retour arrière : les schémas sont isolés dans un paquet ; un changement de bibliothèque se fait
  derrière les mêmes exports et les mêmes tests de contrat.

# docs/adr

Architecture Decision Records : trace écrite de chaque décision structurante et de ses raisons.
Modèle : Annexe A du [plan d'exécution](../PLAN.md). Les décisions courantes de la stack sont tenues
dans [technology_decisions.md](../../technology_decisions.md) (TD-001 à TD-020) ; un ADR reprend et
fige celles que le plan désigne au §4.3, et toute modification substantielle du plan fait l'objet
d'un ADR.

| ADR                                                 | Décision                                                          | Statut  | Date       |
| --------------------------------------------------- | ----------------------------------------------------------------- | ------- | ---------- |
| [ADR-001](ADR-001-nestjs.md)                        | NestJS plutôt que Fastify ou Express nu                           | Accepté | 2026-10-27 |
| [ADR-002](ADR-002-authentification-proprietaire.md) | Authentification propriétaire plutôt que fournisseur externe      | Accepté | 2026-10-27 |
| [ADR-003](ADR-003-postgresql-manage-residence.md)   | PostgreSQL managé, résidence des données à Paris                  | Accepté | 2026-10-27 |
| [ADR-004](ADR-004-zod-contrat-unique.md)            | Zod comme contrat unique de validation                            | Accepté | 2026-10-27 |
| [ADR-005](ADR-005-recherche-progressive.md)         | Recherche progressive : plein texte PostgreSQL, puis moteur dédié | Proposé | 2026-10-27 |
| [ADR-006](ADR-006-abstraction-paiements.md)         | Abstraction des fournisseurs de paiement                          | Accepté | 2026-10-27 |
| [ADR-007](ADR-007-uuidv7-oz-id.md)                  | UUIDv7 technique, OZ ID métier                                    | Accepté | 2026-10-27 |
| [ADR-008](ADR-008-conservation-pieces-identite.md)  | Conservation et purge des documents d'identité                    | Proposé | 2026-10-27 |
| [ADR-009](ADR-009-identite-visuelle.md)             | Identité visuelle : charte OZ Football ID, clair et sombre        | Accepté | 2026-11-10 |
| [ADR-010](ADR-010-session-web-relais-serveur.md)    | Session du site web par relais serveur                            | Accepté | 2026-11-10 |
| [ADR-011](ADR-011-theme-sombre-unique.md)           | Thème sombre unique pour le web, direction « sport »              | Accepté | 2026-11-10 |
| [ADR-012](ADR-012-theme-noir-lime-montserrat.md)    | Thème « Workspace » : noir, lime et Montserrat                    | Accepté | 2026-11-10 |

## Écrire un ADR

1. Copier le modèle de l'Annexe A dans `ADR-NNN-titre-court.md` (numéro suivant, kebab-case).
2. Statut `Proposé` tant que la décision n'est pas validée par Gaëtan Wassu, puis `Accepté` ; un ADR
   remplacé garde son fichier avec le statut `Remplacé par ADR-NNN`.
3. Citer les sources (§ du plan, TD, exigences) ; ajouter la ligne au tableau ci-dessus.

`scripts/docs-foundation.test.mjs` vérifie le modèle et cet index.

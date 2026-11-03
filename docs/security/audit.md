# Journal d'audit

Lots 1.1a (chaîne, immuabilité, partitions) et 1.16a (entretien, ancrage, vérification,
consultation). Exigences : EX-T11, EX-118 n° 1, propriété CP-23. Migrations :
`20261027120000_socle_identite` et `20261107100000_audit_journal`.

## Chaîne

Chaque entrée de `audit_log` porte une position (`chain_position`), le hachage de l'entrée
précédente (`prev_hash`) et son propre hachage SHA-256 (`hash`), calculés par la base au moment de
l'insertion (déclencheur `oz_audit_chain`, singleton `audit_chain_state`). Aucun rôle applicatif ne
peut modifier, supprimer ni vider le journal : la RLS est forcée et les déclencheurs
`oz_audit_immutable` refusent `UPDATE`, `DELETE` et `TRUNCATE`. Preuves :
`packages/db/test/audit-log.int.test.ts` et `packages/db/test/audit-journal.int.test.ts`.

`oz_audit_verify_chain()` recalcule toute la chaîne et rend la première position en défaut :
entrée modifiée, supprimée ou déplacée (CP-23).

## Convention d'écriture

L'insertion verrouille la tête de la chaîne jusqu'au commit : une transaction lente bloque tout
l'audit. **L'entrée d'audit s'écrit à la fin de la transaction**, après les lectures et les contrôles,
juste avant le commit. Aucun appel réseau (stockage, email, fournisseur) ne doit suivre l'écriture
d'audit dans la même transaction. Exemple : `DocumentReadService` inscrit la délivrance, valide la
transaction, puis signe l'URL hors transaction (`apps/api/src/document/document-read.service.ts`).

## Partitions (D-057)

Le journal est partitionné par mois. Une fois par jour, le worker appelle
`oz_audit_maintain_partitions()`, qui crée la partition du mois courant et celles des trois mois
suivants, un mois à la fois : l'échec d'un mois n'empêche pas les autres. La fonction rend le
nombre d'entrées tombées dans `audit_log_default` (toujours 0 en fonctionnement normal), le nombre
de mois en échec et le code SQLSTATE du dernier échec, jamais son message. Alertes du worker :
`audit.partition.default_used` et `audit.partition.failed`. Preuves :
`apps/worker/src/audit-maintenance.test.ts` et `packages/db/test/audit-journal.int.test.ts`.

## Ancrage hors de la base (D-060)

Un propriétaire de la base ou un superutilisateur peut couper les déclencheurs et réécrire toute la
chaîne de façon cohérente : la vérification seule ne le verrait pas. Le worker copie donc la tête
(position, hachage) hors de la base, à cadence fixe (`AUDIT_ANCHOR_EVERY_MINUTES`, 60 par défaut),
dans un bucket dédié :

- verrou Object Lock en mode COMPLIANCE : ni l'application, ni l'administrateur du compte Scaleway ne
  peut effacer ou raccourcir une version avant son échéance (`AUDIT_ANCHOR_LOCK_DAYS`, 400 jours par
  Terraform, 30 au moins en recette et en production) ;
- bucket privé et versionné ; l'application peut lire, lister et écrire, jamais supprimer
  (`infra/terraform/modules/storage/main.tf`, prouvé par `security.tftest.hcl`) ;
- une ancre n'est jamais réécrite : écriture conditionnelle `If-None-Match: *`
  (`packages/storage/src/audit-anchors.ts`) ;
- clé `anchors/<complément de la position sur 20 chiffres>` : la plus récente est la première de la
  liste ; son contenu (`position`, `hash`, `anchoredAt`) est relu strictement, et une ancre illisible
  fait échouer la vérification au lieu de la laisser passer « sans ancre ».

Avant d'écrire une ancre, le worker vérifie la chaîne contre la dernière ancre (`oz_audit_check`) : en
défaut, il n'ancre pas (alerte `audit.anchor.refused`), sinon une réécriture complète serait
« blanchie » par l'ancre suivante. La chaîne reste alors en défaut à chaque vérification.

Sans bucket configuré (local, aperçu), il n'y a pas d'ancrage : la chaîne est vérifiée seule.

## Vérification (CP-23)

Une fois par jour (`AUDIT_VERIFY_EVERY_MINUTES`), le worker lit la dernière ancre et appelle
`oz_audit_check(position, hachage)`. La fonction consigne son résultat dans `audit_chain_checks`
(table immuable) et signale en défaut :

| Cas                                                    | Position en défaut            |
| ------------------------------------------------------ | ----------------------------- |
| Entrée modifiée, supprimée ou déplacée                 | Première position incohérente |
| Chaîne plus courte que l'ancre (entrées retirées)      | Tête + 1                      |
| Hachage de la base différent de l'ancre (réécriture)   | Position ancrée               |
| Ancre plus ancienne qu'une ancre déjà vérifiée (recul) | Ancre la plus avancée connue  |

Le dernier cas couvre l'ancre masquée au stockage : sur un bucket versionné, un `DELETE` sans
version pose un marqueur de suppression et la version verrouillée disparaît de la liste, sans être
effacée. Une réécriture complète de la chaîne est détectée de bout en bout dans
`apps/worker/test/audit-maintenance.int.test.ts`. Alerte du worker : `audit.chain.broken`, avec les
positions seules.

Les fonctions `oz_audit_maintain_partitions`, `oz_audit_head` et `oz_audit_check` sont
`SECURITY DEFINER`, exécutables par `oz_worker` seul et refusées sous contexte utilisateur.

## Consultation (EX-118 n° 1)

L'administrateur vérifié (action `audit.read_log`, [rbac.md](rbac.md)) consulte :

- `GET /admin/audit-log` : entrées de la plus récente à la plus ancienne, filtres par action, type
  et identifiant de cible, acteur et période, page de 1 à 100 (50 par défaut), curseur opaque, jamais
  `OFFSET` ; métadonnées rendues en texte JSON ;
- `GET /admin/audit-log/integrity` : la dernière vérification (`lastCheck`, nul si aucune).

Les deux routes répondent `Cache-Control: no-store`, sont limitées à 600 appels par heure et par
compte, et sont refusées (403) aux sept autres rôles. La RLS (`audit_log_admin_read`) applique la
même règle en base. Le journal applicatif ne garde que le nom des filtres utilisés. Preuves :
`apps/api/test/audit-log.int.test.ts` et `apps/api/test/rbac-matrix.int.test.ts`. L'écran du
back-office viendra au lot 1.11.

## Runbook : chaîne en défaut

1. **Ne rien corriger dans la base.** Le journal est une preuve : toute « réparation » l'efface.
2. Lire la dernière vérification (`GET /admin/audit-log/integrity`) et noter `defectPosition`,
   `headPosition` et `anchorPosition`.
3. Prévenir le responsable sécurité ; traiter l'événement comme un incident
   ([policy.md](policy.md), « Gestion des incidents »).
4. Comparer l'entrée en défaut avec la sauvegarde PostgreSQL la plus proche (runbook de
   [restauration](../runbooks/restauration-postgres.md)) et avec les ancres du bucket, versions comprises (`ListObjectVersions`) : un
   marqueur de suppression sur la dernière ancre indique une tentative de masquage.
5. Lister les comptes ayant eu un accès propriétaire ou superutilisateur à la base, et l'accès au
   bucket, sur la période entre la dernière vérification intègre et la première en défaut.
6. Consigner la conclusion. La vérification reste en défaut tant que la chaîne n'est pas rétablie
   depuis une sauvegarde et qu'une ancre au moins aussi avancée n'est pas relue.

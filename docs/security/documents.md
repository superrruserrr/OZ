# Coffre documentaire

Dépôt des pièces (EX-110), lot 1.9a. L'analyse antivirus et le ré-encodage relèvent du lot 1.9b, la lecture signée et la purge du lot 1.9c. Décisions validées : D1 à D7 du plan du lot 1.9a.

## Flux

1. **Intention** — `POST /documents/upload` (`@Can('document.upload')`). Corps : type de document, une seule cible (`playerId`, `guardianId` ou `organizationId`), type de contenu, taille, SHA-256 en hexadécimal. La cible est lue sous la RLS du demandeur, puis CASL décide sur elle (`documentSubject`, minorité à l'instant de la base). Sans droit, cible cachée ou inconnue : **404** `NOT_FOUND`, sans rien écrire. Sinon, une ligne `document_uploads` `issued` (échéance : 5 minutes, horloge de la base) et une URL PUT signée de 5 minutes. Le journal d'audit inscrit l'acteur, le type et la cible (`document.upload.issued`).
2. **Envoi** — le client envoie le fichier au stockage avec les en-têtes rendus (`content-type`, `content-length`, `x-amz-checksum-sha256`), tous signés : le stockage refuse un autre type, une autre taille, une autre empreinte, une signature altérée ou échue. L'API ne voit jamais le binaire (EX-110 n° 1).
3. **Réception** — `POST /documents/upload/:id/complete`. L'API relit l'intention (la sienne seulement, RLS), vérifie à nouveau le droit sur la cible, puis :
   - objet absent, ou disparu ou remplacé depuis son en-tête (réception concurrente, nouvel envoi) : **409** `DOCUMENT_UPLOAD_MISSING`, sans alerte, l'intention reste ouverte. L'ETag lu par HEAD fige la version vérifiée : lecture des octets de tête (`If-Match`) et copie (`x-amz-copy-source-if-match`) échouent si l'objet a changé ;
   - taille réelle (HEAD) différente : rejet `size_mismatch`, objet supprimé, **422** `DOCUMENT_REJECTED` ;
   - type réel lu sur les 4 100 premiers octets (`file-type`) différent du type déclaré : rejet `type_mismatch`, objet supprimé, alerte `document.upload.type_mismatch` (warn), même **422** ;
   - sinon, dans une seule transaction bornée à 60 s : `oz_complete_document_upload` (usage unique, verrou de ligne) crée le document `pending`, la version vérifiée est copiée de `incoming/<intention>` vers `quarantine/<document>`, puis un job `document-scan` est mis en file (charge : `{ documentId }`, identifiant de job = document). `incoming/` n'est supprimé qu'après la validation. Un échec de mise en file retire la copie et annule tout : **503** ; une copie impossible ou une transaction trop longue annule aussi ; dans tous ces cas l'envoi reste en `incoming/` et le dépôt peut être réceptionné à nouveau. Requêtes au stockage : 5 s pour se connecter, 15 s pour répondre, deux essais (erreur au-delà) ; copie terminée après 45 s : copie retirée, 503, aucun job ; mise en file abandonnée après 5 s. La connexion à la base reste tenue pendant la copie (D-092).
   - intention échue : **410** `DOCUMENT_UPLOAD_EXPIRED`, statut `expired` (journalisé), objet supprimé ; déjà réceptionnée ou rejetée : **409** `DOCUMENT_UPLOAD_USED`.

Un identifiant mal formé reçoit le même 404 qu'un dépôt inconnu. Aucune réponse ne porte de clé de stockage (filet `PayloadGuardInterceptor` : `storageKey`, `storage_key`) ; aucun chemin du lot 1.9a ne produit d'URL de lecture (CP-21). Un document ne s'insère plus sous contexte utilisateur : la politique `documents_subject_insert` est supprimée, seule la réception l'écrit.

## Clés et états

| Clé                     | Contenu                                          |
| ----------------------- | ------------------------------------------------ |
| `incoming/<intention>`  | Fichier envoyé, pas encore réceptionné           |
| `quarantine/<document>` | Fichier réceptionné, en attente d'analyse (1.9b) |

Toute autre clé est refusée par `@oz/storage`. Intention : `issued` → `completed` | `rejected` (`size_mismatch`, `type_mismatch`) | `expired`. Document : `pending` à la réception ; `retention_until` = réception + `DOCUMENT_RETENTION_DAYS` (90 par défaut, de 1 à 3 650).

## Droits (D5)

`document.upload` : joueur sur lui-même ; tuteur sur lui-même et sur son enfant mineur (tuteur vérifié) ; académie et club sur leurs joueurs rattachés et le justificatif de leur organisation ; fédération, centre et recruteur (même sans KYC 3) sur le justificatif de leur organisation ; administrateur : jamais. Matrice : [rbac.md](rbac.md).

## Bornes

| Borne             | Valeur                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| Taille            | 1 octet à 50 Mo (contrat, base, signature)                                        |
| Types (D4)        | photo : JPEG, PNG, WebP ; autres pièces : JPEG, PNG, WebP, PDF ; ni HEIC ni vidéo |
| Validité de l'URL | 5 minutes, usage unique                                                           |
| Intentions        | 20 par heure et par compte (`document_upload_account`)                            |
| Réceptions        | 60 par heure et par compte (`document_complete_account`)                          |
| Stockage local    | bucket privé (lecture anonyme : 403), CORS limité à `S3_ALLOWED_ORIGINS`          |

## Configuration

`FEATURE_DOCUMENTS` (défaut `false`) exige `FEATURE_AUTH=true` et reste refusé en production tant que les lots 1.9b et 1.9c ne sont pas livrés (D7). `DOCUMENT_RETENTION_DAYS` : durée de conservation. En local, `docker compose` crée le bucket `S3_BUCKET` au démarrage du service `s3` ; configuration de lancement `api-documents`.

## Menaces couvertes et restantes

- **Couvertes** : fichier déguisé (type réel lu sur les octets), fichier substitué après l'intention (empreinte, taille et type signés) ou après sa vérification (ETag), rejeu d'une URL ou d'une réception (usage unique), dépôt pour autrui (RLS puis CASL, 404 indiscernable), saturation (limites par compte sur l'intention et la réception, 50 Mo, transaction et requêtes bornées), lecture publique (bucket privé, aucune URL de lecture).
- **Restantes** : antivirus, ré-encodage des images, dimensions et nombre de pages, comparaison des empreintes aux documents déjà soumis (lot 1.9b) ; purge des objets `incoming/` jamais réceptionnés et des documents échus (lot 1.9c, D-062) ; voir D-092.

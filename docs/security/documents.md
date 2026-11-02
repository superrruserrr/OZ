# Coffre documentaire

Dépôt des pièces (EX-110), lot 1.9a ; analyse (antivirus, contrôles, ré-encodage), lot 1.9b ; lecture par URL signée, lot 1.9ca ; la purge relève du lot 1.9cb. Décisions validées : D1 à D7 du lot 1.9a, D1 à D9 du lot 1.9b.

## Flux

1. **Intention** — `POST /documents/upload` (`@Can('document.upload')`). Corps : type de document, une seule cible (`playerId`, `guardianId` ou `organizationId`), type de contenu, taille, SHA-256 en hexadécimal. La cible est lue sous la RLS du demandeur, puis CASL décide sur elle (`documentSubject`, minorité à l'instant de la base). Sans droit, cible cachée ou inconnue : **404** `NOT_FOUND`, sans rien écrire. Sinon, une ligne `document_uploads` `issued` (échéance : 5 minutes, horloge de la base) et une URL PUT signée de 5 minutes. Le journal d'audit inscrit l'acteur, le type et la cible (`document.upload.issued`).
2. **Envoi** — le client envoie le fichier au stockage avec les en-têtes rendus (`content-type`, `content-length`, `x-amz-checksum-sha256`), tous signés : le stockage refuse un autre type, une autre taille, une autre empreinte, une signature altérée ou échue. L'API ne voit jamais le binaire (EX-110 n° 1).
3. **Réception** — `POST /documents/upload/:id/complete`. L'API relit l'intention (la sienne seulement, RLS), vérifie à nouveau le droit sur la cible, puis :
   - objet absent, ou disparu ou remplacé depuis son en-tête (réception concurrente, nouvel envoi) : **409** `DOCUMENT_UPLOAD_MISSING`, sans alerte, l'intention reste ouverte. L'ETag lu par HEAD fige la version vérifiée : lecture des octets de tête (`If-Match`) et copie (`x-amz-copy-source-if-match`) échouent si l'objet a changé ;
   - taille réelle (HEAD) différente : rejet `size_mismatch`, objet supprimé, **422** `DOCUMENT_REJECTED` ;
   - type réel lu sur les 4 100 premiers octets (`file-type`) différent du type déclaré : rejet `type_mismatch`, objet supprimé, alerte `document.upload.type_mismatch` (warn), même **422** ;
   - sinon, dans une seule transaction bornée à 60 s : `oz_complete_document_upload` (usage unique, verrou de ligne) crée le document `pending`, la version vérifiée est copiée de `incoming/<intention>` vers `quarantine/<document>`, puis un job `document-scan` est mis en file (charge : `{ documentId }`, identifiant de job = document). `incoming/` n'est supprimé qu'après la validation. Un échec de mise en file retire la copie et annule tout : **503** ; une copie impossible ou une transaction trop longue annule aussi ; dans tous ces cas l'envoi reste en `incoming/` et le dépôt peut être réceptionné à nouveau. Requêtes au stockage : 5 s pour se connecter, 15 s pour répondre, deux essais (erreur au-delà) ; copie terminée après 45 s : copie retirée, 503, aucun job ; mise en file abandonnée après 5 s. La connexion à la base reste tenue pendant la copie (D-092).
   - intention échue : **410** `DOCUMENT_UPLOAD_EXPIRED`, statut `expired` (journalisé), objet supprimé ; déjà réceptionnée ou rejetée : **409** `DOCUMENT_UPLOAD_USED`.

Un identifiant mal formé reçoit le même 404 qu'un dépôt inconnu. Aucune réponse ne porte de clé de stockage (filet `PayloadGuardInterceptor` : `storageKey`, `storage_key`) ; seule la lecture (lot 1.9ca, ci-dessous) produit une URL de lecture, pour une pièce saine (CP-21). Un document ne s'insère plus sous contexte utilisateur : la politique `documents_subject_insert` est supprimée, seule la réception l'écrit.

## Analyse (lot 1.9b)

Le worker `@oz/worker` consomme la file `document-scan` (5 essais, délai exponentiel). Le message ne porte que `{ documentId }` ; un message hors contrat est abandonné sans nouvel essai (`document.scan.invalid_job`). Il se connecte sous le rôle **`oz_worker`**, seul autorisé à exécuter les deux fonctions `SECURITY DEFINER` de l'analyse ; l'API (`oz_app`) ne peut ni réclamer ni juger un document, et toute la chaîne est refusée sous un contexte utilisateur.

1. **Réclamation** — `oz_document_scan_claim` rend le type, la clé de quarantaine, le type de contenu, la taille et la SHA-256 d'un document `pending` non supprimé ; rien sinon (déjà jugé, inconnu, supprimé : job ignoré).
2. **Lecture** — fichier lu depuis `quarantine/` (50 Mo au plus, taille annoncée refusée avant toute lecture). Fichier absent : erreur, nouvel essai.
3. **Empreinte** — SHA-256 recalculée ; différente de celle signée au dépôt : `rejected` (`hash_mismatch`), alerte.
4. **Antivirus** — ClamAV (`zINSTREAM`, 5 s pour se connecter, 60 s pour l'analyse). `FOUND` : `infected`, signature enregistrée (caractères filtrés), alerte `document.scan.infected` (identifiant et type du document, signature, rien d'autre). Seule la réponse exacte `stream: OK` vaut « sain » ; toute autre réponse, délai ou coupure est une panne (nouvel essai). clamd est réglé sur la borne de dépôt (`StreamMaxLength` et `MaxFileSize` à 50 Mo) et signale une analyse tronquée par une limite (`AlertExceedsMax` : `infected`).
5. **Contrôles et ré-encodage** :
   - **Images** (JPEG, PNG, WebP) : format réel égal au type vérifié, dimensions lues sur l'en-tête avant décodage (200 à 8 000 px par côté, 40 Mpx au plus, orientation EXIF comprise) ; ré-encodage par sharp dans le même format (JPEG et WebP qualité 90, PNG compression 9), sRGB, orientation appliquée, **aucune métadonnée conservée** (EXIF, GPS, XMP, IPTC, ICC), octets annexes et segments de commentaire détruits ; 30 s au plus. WebP animé : seule la première image est conservée. Empreinte perceptuelle dHash 64 bits calculée sur l'image ré-encodée.
   - **PDF** : structure lue par pdf.js sans rendu, sans police ni JavaScript ni accès réseau ; 1 à 20 pages, chaque page annoncée doit exister ; chiffré (même lisible sans mot de passe), tronqué ou corrompu : `rejected` (`unreadable`). Le fichier est conservé tel quel (risques restants : D-093, D-094).
   - Hors bornes : `rejected` (`dimensions`, `pages`, `unreadable`).
6. **Écriture** — fichier sain écrit sous `clean/<document>` (somme SHA-256 envoyée au stockage), **puis** verdict `clean` (`oz_document_scan_finish`), **puis** quarantaine retirée. Verdict impossible ou déjà écrit par un autre essai : `clean/` laissé en place (une réponse perdue peut cacher un verdict validé, et un autre essai écrit la même clé) ; un fichier sans verdict `clean` n'est servi par rien et sera purgé (lot 1.9c). `infected` et `rejected` : verdict, puis quarantaine retirée — aucun fichier ne subsiste.
7. **Dernier essai en panne** — verdict `error` (document jamais accessible) et alerte `document.scan.failed`.

`oz_document_scan_finish` ne juge qu'une fois (verrou de ligne ; un second verdict est ignoré : `skipped`), vérifie la cohérence du verdict (motif, dimensions réservées aux images, pages aux PDF, clé `clean/<document>` si et seulement si `clean`), et inscrit l'audit `document.scan.<verdict>` sans acteur. **Doublon** : une pièce d'un autre sujet de même SHA-256 (`pending` ou `clean`) crée un signal `document_duplicates` et l'audit `document.scan.duplicate`, sans rejet (revue KYC, lot 1.10 ; empreinte perceptuelle comparée au lot 1.10, D-098). Une garde en base fige le sujet, le type et l'empreinte, et n'autorise la clé `clean/`, la taille et les colonnes de verdict qu'au passage `pending` → verdict, par le chemin privilégié.

Journaux du worker : JSON (pino), identifiant de document, type, motif ou type d'erreur — jamais le contenu, la clé de stockage, l'empreinte ni le message d'une erreur (démarrage impossible compris : type d'erreur seul). Sonde de vivacité `/health/live` sur 127.0.0.1 seulement.

## Lecture (lot 1.9ca)

`GET /documents/:id/url` (`@Can('document.read')`, `Cache-Control: no-store`). Dans une transaction sous la RLS du demandeur, `readableDocumentFor` ne rend qu'une pièce `clean`, ni supprimée ni purgée (`purged_at`), dont le sujet est visible ; CASL décide sur ce sujet (`documentSubject`, minorité à l'instant de la base). Puis, dans la même transaction, l'audit `document.read.granted` (acteur, pièce, type ; ni clé ni URL, `audit_log_insert_self`) ; **ensuite seulement**, `presignGet` signe une URL GET de 300 s sur `clean/<document>`, qui impose `Content-Type` (type réel vérifié), `Content-Disposition: attachment` et `Cache-Control: no-store` : le stockage refuse toute variante de ces paramètres, une signature altérée, une requête non signée ou échue (CP-22, prouvé sur SeaweedFS). Réponse : `{ url, expiresAt }`.

Inconnue, mal formée, cachée, non saine (`pending`, `infected`, `rejected`, `error`), supprimée, purgée ou sans droit : **même 404** `NOT_FOUND`, sans audit (CP-21). Audit impossible : aucune URL. Journal applicatif : `document.read.granted` ou `document.read.refused` avec l'identifiant du document (s'il est bien formé), jamais l'URL ni la clé. L'administrateur lit toute pièce dont le sujet est encore en place (`documents_admin_read`, revue KYC ; `oz_document_subject_live`, fonction `SECURITY DEFINER` réservée à `oz_app` qui ne rend qu'un booléen) sans voir pour autant les fiches tuteur ni les organisations ; sa décision CASL ne porte sur aucun champ du sujet. Cette lecture n'ouvre aucun rattachement à un dossier KYC : la garde `oz_kyc_case_documents_guard` refuse une pièce d'un autre sujet. Une URL délivrée reste valable jusqu'à son échéance, même si la pièce est purgée entre-temps (D-101).

## Clés et états

| Clé                     | Contenu                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `incoming/<intention>`  | Fichier envoyé, pas encore réceptionné                              |
| `quarantine/<document>` | Fichier réceptionné, en attente d'analyse ; retiré après le verdict |
| `clean/<document>`      | Fichier analysé et sain (image ré-encodée, PDF tel quel)            |

Toute autre clé est refusée par `@oz/storage` ; seul le worker écrit sous `clean/`. Intention : `issued` → `completed` | `rejected` (`size_mismatch`, `type_mismatch`) | `expired`. Document : `pending` à la réception → `clean` | `infected` | `rejected` (`dimensions`, `pages`, `unreadable`, `hash_mismatch`) | `error` ; `retention_until` = réception + `DOCUMENT_RETENTION_DAYS` (90 par défaut, de 1 à 3 650).

## Droits (D5)

`document.upload` : joueur sur lui-même ; tuteur sur lui-même et sur son enfant mineur (tuteur vérifié) ; académie et club sur leurs joueurs rattachés et le justificatif de leur organisation ; fédération, centre et recruteur (même sans KYC 3) sur le justificatif de leur organisation ; administrateur : jamais. `document.read` (lot 1.9ca, décision du 2026-11-02) : mêmes portées, plus l'administrateur sur toute pièce, toujours journalisé. Matrice : [rbac.md](rbac.md).

## Bornes

| Borne             | Valeur                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| Taille            | 1 octet à 50 Mo (contrat, base, signature)                                        |
| Types (D4)        | photo : JPEG, PNG, WebP ; autres pièces : JPEG, PNG, WebP, PDF ; ni HEIC ni vidéo |
| Validité de l'URL | dépôt : 5 minutes, usage unique ; lecture : 5 minutes                             |
| Intentions        | 20 par heure et par compte (`document_upload_account`)                            |
| Réceptions        | 60 par heure et par compte (`document_complete_account`)                          |
| URL de lecture    | 120 par heure et par compte (`document_read_account`)                             |
| Stockage local    | bucket privé (lecture anonyme : 403), CORS limité à `S3_ALLOWED_ORIGINS`          |
| Images            | 200 à 8 000 px par côté, 40 Mpx au plus                                           |
| PDF               | 1 à 20 pages                                                                      |

## Configuration

`FEATURE_DOCUMENTS` (défaut `false`) exige `FEATURE_AUTH=true` et reste refusé en production tant que le lot 1.9cb (purge) n'est pas livré et que D-092, D-093 et D-097 demeurent (D7). Worker : `WORKER_DATABASE_URL` (rôle `oz_worker`, exigé hors local et distinct de `DATABASE_URL` ; repli sur `DATABASE_URL` en local seulement), `REDIS_URL`, `S3_*`, `CLAMAV_HOST`, `CLAMAV_PORT`, `WORKER_CONCURRENCY` (1 à 8, 2 par défaut) ; configuration de lancement `worker`. `DOCUMENT_RETENTION_DAYS` : durée de conservation. En local, `docker compose` crée le bucket `S3_BUCKET` au démarrage du service `s3` ; configuration de lancement `api-documents`.

## Menaces couvertes et restantes

- **Couvertes** : fichier déguisé (type réel lu sur les octets), fichier substitué après l'intention (empreinte, taille et type signés) ou après sa vérification (ETag), rejeu d'une URL ou d'une réception (usage unique), dépôt pour autrui (RLS puis CASL, 404 indiscernable), saturation (limites par compte sur l'intention et la réception, 50 Mo, transaction et requêtes bornées), lecture publique (bucket privé, aucune URL de lecture).
- **Couvertes au lot 1.9b** : fichier infecté (ClamAV, rien ne subsiste), charge cachée dans une image (ré-encodage, métadonnées et octets annexes détruits), bombe de décompression (dimensions lues sur l'en-tête), PDF hors bornes, chiffré ou corrompu, fichier remplacé en quarantaine (SHA-256 recomparée), pièce réutilisée pour un autre sujet (signal de doublon), verdict forgé par l'API ou un utilisateur (rôle `oz_worker` seul, refus sous contexte utilisateur, garde en base).
- **Couvertes au lot 1.9ca** : lecture d'une pièce non analysée ou rejetée (sain seulement, 404 uniforme), lecture par un tiers (RLS puis CASL), URL réutilisée longtemps ou partagée (5 minutes, audit de chaque délivrance), réponse détournée en page web (type et `attachment` signés), lien deviné (aucun accès sans signature).
- **Restantes** : purge des objets orphelins et des documents échus (lot 1.9cb, D-062, D-092) ; URL encore valable après une purge (D-101) ; PDF hostile bloquant le worker (D-093) ; `/Count` sous-déclaré (D-094) ; comparaison perceptuelle (D-098) ; documents laissés `pending` par un job abandonné (D-099) ; privilège de lecture de `oz_worker` (D-100) ; déploiement en recette (D-097).

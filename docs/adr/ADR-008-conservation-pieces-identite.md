# ADR-008 : Politique de conservation et de purge des documents d'identité

Statut : Proposé
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

La vérification d'identité impose de recevoir des pièces d'identité, des actes de naissance et des
selfies, souvent de mineurs ([plan §7.4](../PLAN.md)). Ces fichiers sont la donnée la plus dangereuse
de la plateforme en cas de fuite (§6.1, risque 2). Le plan pose le principe : OZ conserve la
**preuve de la vérification**, pas nécessairement le document (§7.4). Il impose aussi la
minimisation (§6.7 n° 7), le chiffrement des documents et un accès par URL signée de 5 minutes
(§6.9), et un cadre réglementaire multiple : RGPD, loi camerounaise n° 2010/012, Loi 25 (§6.8).

Sources : plan §5.2 (`documents.retention_until`), §6.1, §6.7, §6.9, §7.4 ; `requirements.md`
(chaque document porte une date `retention_until` et est purgé à échéance ; purge du document brut
après approbation selon `DOCUMENT_RETENTION_DAYS`) et question Q9 ; `.env.example`
(`DOCUMENT_RETENTION_DAYS=90`).

## Options envisagées

1. **Purge du document brut après décision, conservation de la preuve** — décision, motif,
   décideurs, horodatage, empreinte SHA-256 et métadonnées conservés ; fichier supprimé à
   `retention_until`. Avantages : surface de fuite minimale, badge toujours prouvable par l'empreinte
   et le journal d'audit. Inconvénients : impossible de réexaminer le document original après purge
   (une contestation tardive impose une nouvelle soumission).
2. **Conservation pendant toute la vie du compte** — réexamen toujours possible. Inconvénients :
   contraire à la minimisation, risque maximal en cas de fuite, difficile à justifier au registre
   RGPD.
3. **Purge immédiate dès la décision** — risque minimal. Inconvénients : aucun délai pour une
   contestation ou un contrôle qualité de la décision (quatre yeux), aucune trace en cas de fraude
   découverte peu après.

## Décision

Proposée : option 1.

- Chaque document reçoit une date `retention_until` dès son dépôt ; une tâche planifiée supprime le
  fichier à échéance (stockage et copies de secours selon leur propre rétention), et la suppression
  est inscrite au journal d'audit.
- Après approbation ou rejet définitif, le fichier brut est conservé `DOCUMENT_RETENTION_DAYS` jours
  puis purgé. **Durée proposée : 90 jours après décision** (hypothèse par défaut de Q9, valeur de
  `.env.example`), **à valider avec le juriste** au regard du RGPD, de la loi n° 2010/012 et de la Loi
  25 (Q7) : aucune durée légale n'est affirmée ici.
- Sont conservés : la décision, son motif, les deux validateurs (quatre yeux pour les mineurs,
  recruteurs et centres), l'horodatage, l'empreinte SHA-256, le type de pièce et les résultats des
  contrôles, sans le fichier.
- Un document infecté est rejeté et supprimé immédiatement ; un dossier rejeté puis resoumis suit la
  même règle pour chaque document.

Mise en œuvre (lot 1.9cb) : tâche planifiée du worker, fichier supprimé à `retention_until` puis
pièce marquée purgée (`purged_at`), extrait OCR et numéro chiffrés effacés, empreinte du numéro,
SHA-256, type, verdict et mesures conservés, audit `document.purge.done` ; voir
[documents.md](../security/documents.md#purge-lot-19cb). Les copies de secours et versions d'objets
restent à prouver au lot 1.10.

Statut « Proposé » : passera « Accepté » après validation juridique de la durée, au plus tard au lot
1.10 (pipeline KYC), et avant l'ouverture des inscriptions (lot 1.18).

## Conséquences

- Positives : au-delà de 90 jours, une fuite du stockage n'expose plus de pièce d'identité ; la
  valeur du badge repose sur la preuve conservée.
- Négatives : toute contestation tardive exige une nouvelle soumission ; la purge doit couvrir aussi
  les copies de secours et les versions d'objets (versioning du bucket) — à prouver par test au lot
  1.10 ; la durée conditionne le registre des traitements (lot 1.16).
- Ce que cela ferme : l'archivage indéfini des pièces. Ce que cela ouvre : une réponse simple à une
  demande d'accès ou d'effacement (RGPD).
- Retour arrière : la durée est un paramètre (`DOCUMENT_RETENTION_DAYS`) ; l'allonger ne concerne
  que les documents non encore purgés. Une purge est irréversible par conception.

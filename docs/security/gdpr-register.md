# Registre des activités de traitement (RGPD art. 30)

> **Statut : brouillon technique, non validé.** Rédigé le 2026-11-09 (lot 1.16cbb, EX-118 n° 4) à
> partir de ce qui est construit jusqu'au lot 1.16cbb. Il décrit ce que fait le système ; il
> **n'affirme aucune qualification juridique, base légale ni durée légale**. Tout ce qui n'est pas
> décidé est marqué [À CONFIRMER] et relève du juriste ou de Fabrice. Aucun contact n'est inventé.

## Responsable du traitement

| Rubrique                           | Valeur                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Responsable du traitement          | OZ, entité qui exploite et facture [À CONFIRMER, Q20]                       |
| Représentant dans l'UE (art. 27)   | [À CONFIRMER juriste] : nécessité selon l'entité retenue                    |
| Délégué à la protection (DPO)      | [À CONFIRMER] : désignation et contact non décidés                          |
| Contact pour l'exercice des droits | [À CONFIRMER] ; dans l'application : export et suppression (ci-dessous, T7) |

## Sous-traitants et transferts

Choisis dans `technology_decisions.md` ; contrats (DPA) à signer avant la production [À CONFIRMER].

| Sous-traitant                        | Rôle                                                                         | Décision               | Localisation                         | Transfert hors UE                                   |
| ------------------------------------ | ---------------------------------------------------------------------------- | ---------------------- | ------------------------------------ | --------------------------------------------------- |
| Scaleway                             | Hébergement, PostgreSQL managé, Redis, stockage objets, email transactionnel | TD-009, TD-010, TD-011 | Paris (copie de secours à Amsterdam) | Non                                                 |
| Cloudflare                           | DNS, CDN, WAF devant l'application (transit)                                 | TD-009                 | [À CONFIRMER]                        | [À CONFIRMER juriste]                               |
| Infobip                              | SMS et WhatsApp (code de vérification du téléphone)                          | TD-012                 | UE                                   | Non [À CONFIRMER]                                   |
| Twilio                               | SMS de secours                                                               | TD-012                 | États-Unis                           | Oui, en secours seulement [À CONFIRMER : garanties] |
| Sentry                               | Erreurs applicatives, données personnelles nettoyées avant envoi             | TD-014                 | UE                                   | Non [À CONFIRMER]                                   |
| Better Stack                         | Sondes de disponibilité, sans donnée personnelle                             | TD-014                 | [À CONFIRMER]                        | [À CONFIRMER]                                       |
| Fournisseur KYC (Veriff ou Smile ID) | OCR, vivacité, concordance faciale (lot 1.10)                                | TD-015                 | [À CONFIRMER au POC]                 | [À CONFIRMER, voir `aipd.md`]                       |

Les utilisateurs sont au Cameroun, l'entité au Québec et des recruteurs en Europe : les flux entre
ces pays sont à qualifier par le juriste (plan §6.8, `aipd.md` §9) [À CONFIRMER].

## Traitements

Bases légales et durées légales : [À CONFIRMER juriste] pour chaque traitement. Les durées techniques
déjà en place sont citées ; elles sont appliquées par la base et le worker, pas par une procédure
manuelle.

### T1 — Comptes et authentification

- **Finalité :** créer un compte, se connecter, sécuriser l'accès (2FA, sessions, alertes).
- **Personnes :** titulaires de compte (joueurs, tuteurs, membres d'organisation, recruteurs,
  administrateurs).
- **Données :** email, empreinte du mot de passe, rôles, téléphone chiffré, secret TOTP chiffré,
  codes de secours en empreinte, sessions (appareil, adresse IP), jetons d'email en empreinte.
- **Destinataires :** le titulaire ; les administrateurs pour l'exploitation.
- **Conservation :** durée du compte ; sessions et jetons à échéance courte (`auth.md`) ;
  anonymisation à la suppression du compte (`account-deletion.md`).
- **Sécurité :** `auth.md`, `policy.md`.

### T2 — Profils joueurs, mineurs et tuteurs

- **Finalité :** tenir la fiche joueur et son OZ ID, la tutelle d'un mineur et son consentement de
  publication.
- **Personnes :** joueurs, dont des mineurs dès 6 ans ; tuteurs.
- **Données :** identité, date de naissance, nationalité, ville, téléphone et numéro de pièce
  chiffrés, données sportives ; fiche tuteur ; consentements ; OZ ID.
- **Destinataires :** le joueur, son tuteur, son organisation ; les tiers selon la matrice des
  droits (`rbac.md`) — un mineur n'est visible que vérifié et publié avec consentement. Lot
  1.13b : carte OZ ID (titulaire, tuteur) et export PDF de la vue du lecteur, filigrané à son nom
  et audité.
- **Conservation :** durée du compte ; anonymisation à la suppression, OZ ID réservé à vie (EX-118
  n° 3, CP-03).
- **Sécurité :** `rbac.md` (RLS alignée sur la matrice), `threats.md`.

### T3 — Vérification d'identité (KYC) et pièces

- **Finalité :** vérifier l'identité et l'âge pour délivrer le badge « Profil vérifié ».
- **Personnes :** joueurs, tuteurs.
- **Données :** pièces d'identité et justificatifs, extrait OCR et numéro chiffrés, empreintes
  (SHA-256, perceptuelle, numéro), dossiers KYC et décisions.
- **Destinataires :** administrateurs (revue) ; fournisseur KYC au lot 1.10 (TD-015).
- **Conservation :** `retention_until` par pièce, `DOCUMENT_RETENTION_DAYS` (90 jours par défaut),
  purge programmée (`documents.md`, ADR-008) [À CONFIRMER : durée légale].
- **Sécurité :** `documents.md`, `aipd.md`.

### T4 — Recherche de joueurs par les recruteurs et les organisations

- **Finalité :** permettre aux organisations vérifiées de découvrir des joueurs.
- **Personnes :** joueurs.
- **Données :** champs de la fiche ouverts à chaque rôle (`rbac.md`, vues par rôle).
- **Destinataires :** académies, clubs, fédérations, centres vérifiés, selon la matrice.
- **Conservation :** aucune copie : lecture de la fiche (T2) ; fiche masquée pendant une suppression
  demandée. Lot 1.14a : chaque recherche est inscrite au journal (T6) sans valeur de critère ; un
  mineur listé à un lecteur journalisé l'est aussi, visible de son tuteur. Lot 1.14b : recherches
  sauvegardées (`saved_searches`, critères et tri, privées au compte, supprimées à la clôture du
  compte) ; exports CSV inscrits (`search_exports`, sans valeur de critère, conservés pour la
  traçabilité du filigrane et le quota) et audités, fichier filigrané au nom du demandeur.
- **Sécurité :** `rbac.md`.

### T5 — Notifications

- **Finalité :** envoyer les emails et SMS de service (confirmation, alertes, suivi des demandes).
- **Personnes :** titulaires de compte.
- **Données :** destinataire, contenu de la notification, état d'envoi.
- **Destinataires :** Scaleway (email), Infobip ou Twilio (SMS).
- **Conservation :** [À CONFIRMER] ; contenu effacé à la suppression du compte.
- **Sécurité :** `policy.md`.

### T6 — Journal d'audit

- **Finalité :** tracer les actions sensibles, prouver l'intégrité (chaîne, ancrage).
- **Personnes :** acteurs et sujets des actions.
- **Données :** acteur, action, cible, motif, métadonnées sans donnée de fiche.
- **Destinataires :** administrateurs ; autorités sur demande [À CONFIRMER].
- **Conservation :** `audit.md` (partitions, ancrage) [À CONFIRMER : durée légale] ; conservé à la
  suppression d'un compte, comme preuve.
- **Sécurité :** `audit.md`.

### T7 — Exercice des droits : export et suppression

- **Finalité :** répondre aux demandes d'accès et de portabilité (export) et d'effacement.
- **Personnes :** titulaires de compte ; tuteurs pour leur enfant mineur.
- **Données :** demandes, archive JSON de l'export, preuve de la suppression.
- **Destinataires :** le titulaire (URL signée de 5 minutes).
- **Conservation :** archive 7 jours après « prête » (`data-export.md`) ; suppression exécutée après
  30 jours de rétractation, demandes conservées comme preuve (`account-deletion.md`).
- **Sécurité :** `data-export.md`, `account-deletion.md`.

### T8 — Organisations et abonnements

- **Finalité :** gérer les académies, clubs, fédérations et centres, leurs imports et abonnements.
- **Personnes :** membres d'organisation (via T1).
- **Données :** organisation, imports, abonnements ; aucune donnée de joueur propre (renvoi à T2).
- **Destinataires :** membres de l'organisation, administrateurs.
- **Conservation :** [À CONFIRMER] ; facturation au lot 2.10 (TD-013, Q20).
- **Sécurité :** `rbac.md`.

## Tables et traitements

Chaque table de la base est rattachée à au moins un traitement ; la liste est vérifiée contre le
registre d'effacement (`packages/db/src/erasure/gdpr-register.test.ts`).

<!-- gdpr:tables -->

| Table                       | Traitements |
| --------------------------- | ----------- |
| `system_settings`           | T1          |
| `users`                     | T1, T7      |
| `user_roles`                | T1          |
| `sessions`                  | T1          |
| `auth_tokens`               | T1          |
| `auth_recovery_codes`       | T1          |
| `organizations`             | T8          |
| `players`                   | T2, T4      |
| `guardians`                 | T2          |
| `consents`                  | T2, T4      |
| `oz_id_registry`            | T2          |
| `documents`                 | T3          |
| `document_duplicates`       | T3          |
| `document_uploads`          | T3          |
| `kyc_cases`                 | T3          |
| `kyc_case_documents`        | T3          |
| `imports`                   | T8          |
| `subscriptions`             | T8          |
| `notifications`             | T5          |
| `audit_log`                 | T6          |
| `audit_chain_state`         | T6          |
| `audit_chain_checks`        | T6          |
| `data_export_requests`      | T7          |
| `account_deletion_requests` | T7          |
| `saved_searches`            | T4          |
| `search_exports`            | T4          |

<!-- /gdpr:tables -->

# Politique de confidentialité — OZ Football ID

> **Statut : texte provisoire, non validé juridiquement.** Rédigé le 2026-11-10 par l'équipe
> technique à la demande de Fabrice Olinga (Q7), à partir de ce que fait réellement le système
> (`docs/security/gdpr-register.md`). Il sert aux écrans et aux tests jusqu'à sa relecture par un
> juriste en fin de projet, **avant l'ouverture des inscriptions en production** (EX-106 n° 5).
> Tout ce qui est marqué [À COMPLÉTER] ou [À VÉRIFIER] doit être tranché à cette relecture. Aucune
> adresse ni aucun contact n'est inventé.

Version provisoire 0.1 — 2026-11-10.

## 1. Qui sommes-nous

OZ Football ID (« OZ ») est une plateforme d'identité sportive vérifiée pour les joueurs de football,
leurs tuteurs et les organisations qui les forment, les suivent ou les recrutent.

| Rubrique                             | Valeur                                              |
| ------------------------------------ | --------------------------------------------------- |
| Responsable du traitement            | [À COMPLÉTER : entité qui exploite et facture, Q20] |
| Adresse                              | [À COMPLÉTER]                                       |
| Contact « données personnelles »     | [À COMPLÉTER]                                       |
| Délégué à la protection des données  | [À COMPLÉTER : désignation et contact]              |
| Représentant dans l'Union européenne | [À VÉRIFIER : nécessaire selon l'entité retenue]    |

## 2. Textes applicables

Selon le pays de l'utilisateur et l'entité retenue, peuvent s'appliquer notamment [À VÉRIFIER
juriste] :

- au Cameroun, la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à
  caractère personnel ;
- au Québec, la Loi sur la protection des renseignements personnels dans le secteur privé ;
- dans l'Union européenne, le règlement général sur la protection des données (RGPD).

## 3. Les données que nous traitons, et pourquoi

| Usage                                      | Données                                                                                                    | Base [À VÉRIFIER]                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Créer et sécuriser votre compte            | Email, mot de passe (stocké sous forme d'empreinte), téléphone, rôle, sessions (appareil, adresse IP), 2FA | Exécution du contrat                       |
| Tenir votre fiche joueur et votre OZ ID    | Identité, date de naissance, nationalité, ville, données sportives, photo                                  | Exécution du contrat ; consentement tuteur |
| Vérifier votre identité et votre âge (KYC) | Pièce d'identité, justificatifs, contrôle de vivacité, résultat de la vérification                         | Intérêt légitime (lutte contre la fraude)  |
| Vous faire découvrir par des organisations | Champs de la fiche ouverts à chaque type de lecteur, jamais vos coordonnées directes                       | Consentement (publication du profil)       |
| Vous envoyer des messages de service       | Email, téléphone, contenu du message                                                                       | Exécution du contrat                       |
| Tracer les actions sensibles               | Auteur, action, cible, date (journal d'audit)                                                              | Obligation et intérêt légitime             |
| Gérer les organisations et abonnements     | Organisation, membres, abonnement                                                                          | Exécution du contrat                       |

Nous ne collectons **ni données de santé, ni données scolaires, ni géolocalisation précise**. Nous
ne vendons aucune donnée et n'affichons aucune publicité ciblée.

## 4. Joueurs mineurs

- Un joueur peut s'inscrire dès 6 ans. Un mineur ne peut être rendu visible qu'après le
  **consentement daté d'un tuteur légal dont l'identité est vérifiée**.
- Les coordonnées directes d'un mineur ne sont communiquées à **aucune** organisation ni à aucun
  recruteur : le contact passe par son organisation de rattachement ou par son tuteur.
- Un recruteur dont l'organisation n'est pas vérifiée ne voit aucun profil de mineur.
- Chaque consultation du profil d'un mineur par un recruteur est enregistrée et visible du tuteur.
- Aucun profil de mineur n'est indexé par les moteurs de recherche.
- Aucune décision automatique irrévocable n'est prise sur un mineur.

## 5. Qui voit vos données

- **Vous**, et pour un mineur, **son tuteur**.
- **Les organisations vérifiées** (académies, clubs, fédérations, centres, recruteurs), seulement les
  champs que leur rôle autorise. Leurs exports sont filigranés à leur nom et enregistrés.
- **L'équipe OZ**, pour la vérification d'identité, la modération et l'exploitation, chaque accès
  sensible étant journalisé.
- **Nos prestataires**, pour notre compte et sous contrat :

| Prestataire                          | Rôle                                    | Lieu                                   |
| ------------------------------------ | --------------------------------------- | -------------------------------------- |
| Scaleway                             | Hébergement, base de données, emails    | France (copie de secours aux Pays-Bas) |
| Cloudflare                           | Réseau et protection du site            | [À VÉRIFIER]                           |
| Infobip                              | SMS et WhatsApp de vérification         | Union européenne                       |
| Twilio                               | SMS de secours                          | États-Unis                             |
| Sentry                               | Suivi des erreurs, sans donnée de fiche | Union européenne                       |
| Fournisseur KYC (Veriff ou Smile ID) | Vérification de la pièce et du visage   | [À VÉRIFIER]                           |

Les utilisateurs sont principalement au Cameroun, l'hébergement en France et une partie des
lecteurs à l'étranger : les garanties de ces transferts sont [À VÉRIFIER juriste].

## 6. Combien de temps

| Données                            | Durée                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Compte et fiche                    | Tant que le compte existe                                                      |
| Pièces d'identité et justificatifs | 90 jours après dépôt, puis suppression automatique [À VÉRIFIER : durée légale] |
| Archive de vos données (export)    | 7 jours après sa préparation                                                   |
| Après une demande de suppression   | 30 jours pour changer d'avis, puis anonymisation                               |
| OZ ID                              | Réservé à vie, jamais réattribué, sans lien avec vous après anonymisation      |
| Journal d'audit                    | Conservé comme preuve après la suppression du compte [À VÉRIFIER : durée]      |
| Messages de service                | [À COMPLÉTER] ; contenu effacé à la suppression du compte                      |

## 7. Vos droits

Vous pouvez à tout moment, **depuis votre compte** :

- **télécharger** toutes vos données (archive lisible par une machine) ;
- **supprimer** votre compte (30 jours pour changer d'avis) ; pour un mineur, le tuteur fait la
  demande ;
- **corriger** votre fiche, **retirer** le consentement de publication (tuteur) et **voir** qui a
  consulté le profil d'un mineur (tuteur).

Pour toute autre demande (opposition, limitation, réclamation) : [À COMPLÉTER : contact]. Vous
pouvez aussi saisir l'autorité de protection des données de votre pays [À COMPLÉTER : autorités].

## 8. Sécurité

Données chiffrées en transit et, pour les plus sensibles (téléphone, numéro de pièce, secret 2FA),
au repos ; accès limités par rôle jusque dans la base de données ; double authentification ;
journal d'audit infalsifiable ; sauvegardes chiffrées.

## 9. Cookies

Seuls des cookies nécessaires au fonctionnement (session, sécurité, préférence de thème) sont
utilisés. Aucun cookie publicitaire [À VÉRIFIER si une mesure d'audience est ajoutée].

## 10. Modifications

Toute modification importante vous sera signalée dans l'application avant son entrée en vigueur.

# Modèle de menaces

Référence : [plan d'exécution](../PLAN.md) §6.1 (les huit risques réels), §3.5, §6.2 à §6.9 et
chapitre 7 (KYC). Les mesures et leur état sont tenus dans la [politique de sécurité](policy.md).
État au 2026-10-27 : aucune fonctionnalité métier n'est encore livrée (fin de la couche 0) ; les
mesures ci-dessous sont donc surtout **prévues**, avec le lot qui les livre et les vérifie.

## Périmètre et actifs

| Actif                                                  | Sensibilité                                    |
| ------------------------------------------------------ | ---------------------------------------------- |
| Identités vérifiées (pièces, OZ ID, date de naissance) | Critique : c'est le produit                    |
| Données de mineurs et de leurs tuteurs                 | Critique : risque humain et réglementaire      |
| Performances certifiées et leurs preuves               | Élevée : valeur du badge « certifié »          |
| Comptes à privilèges (admin OZ, centres, fédérations)  | Critique : accès total ou pouvoir de certifier |
| Base de profils dans son ensemble                      | Élevée : avantage concurrentiel                |
| Secrets d'infrastructure et clés                       | Critique                                       |

Acteurs malveillants considérés : fraudeur à l'âge (joueur, famille, agent), faux recruteur
cherchant à approcher des mineurs, centre complaisant ou compromis, robot d'inscription, concurrent
qui aspire la base, utilisateur authentifié qui tente d'élargir ses droits, attaquant externe
opportuniste.

## Frontières de confiance

1. **Navigateur ou application mobile → API** : rien de ce qui vient du client n'est cru (ADR-004).
2. **API → PostgreSQL** : RLS en dernier rempart si l'application est contournée (§3.5).
3. **API → stockage objets** : documents hors du domaine applicatif, URL signées de 5 minutes.
4. **API → prestataires** (SMS, email, paiement, CAPTCHA) : abstractions, données minimales.
5. **Back-office → données** : rôles à 2FA, chaque action journalisée (R11).
6. **CI et chaîne d'approvisionnement → production** : dépendances et images vérifiées.

Échelle utilisée : vraisemblance et impact en Faible, Moyen, Élevé ; le risque résiduel est celui
qui reste une fois les mesures prévues en place.

## 1. Fraude à l'âge et à l'identité

- **Scénario** : un joueur de 19 ans s'inscrit avec un acte de naissance falsifié pour paraître
  15 ans, ou un même joueur ouvre un second profil sous une autre identité.
- **Impact** : Élevé. Le produit perd sa raison d'être, la crédibilité de tous les profils vérifiés
  tombe.
- **Mesures** : KYC multi-niveaux (chapitre 7), double vérification client et serveur, quatre yeux
  sur les mineurs, détection de doublons, OZ ID unique et jamais réattribué (ADR-007), pièces
  conservées puis purgées selon ADR-008.
- **État** : prévu.
- **Risque résiduel** : Moyen. Un faux document de bonne qualité peut passer la revue humaine ; la
  révocabilité du badge et le signalement en limitent la durée.
- **Lot de vérification** : 1.2 (OZ ID), 1.10 et 1.10b (KYC), 3.6 (fraude statistique).

## 2. Fuite de données de mineurs

- **Scénario** : une faille d'autorisation, un export ou une sauvegarde mal protégée expose les
  coordonnées ou les pièces d'identité de mineurs.
- **Impact** : Élevé. Risque humain grave, sanction réglementaire, fin du projet.
- **Mesures** : trois couches de cloisonnement (RLS, CASL, sérialisation par vue), coordonnées de
  mineurs jamais envoyées à aucun rôle, chiffrement `pgcrypto` des champs d'identité, URL signées,
  journalisation des consultations, minimisation, purge, aucune donnée réelle hors production
  (R10), masquage des champs sensibles dans les logs (en place).
- **État** : partiel (journalisation masquée, chiffrement disque, TLS vers les données ; trois
  couches de cloisonnement et coordonnées de mineurs réservées au tuteur et à l'admin, lot 1.4b) ;
  journalisation des consultations, URL signées et purge prévues.
- **Risque résiduel** : Moyen tant que les écarts D-035, D-041 et D-046 sont ouverts ; Faible ensuite.
- **Lot de vérification** : 1.1, 1.4, 1.13, 1.16, test d'intrusion du lot 1.17.

## 3. Comptes recruteurs frauduleux

- **Scénario** : une personne se fait passer pour le recruteur d'un club européen afin de
  contacter des jeunes avec de fausses promesses.
- **Impact** : Élevé. Risque de traite : le fléau que la plateforme veut combattre.
- **Mesures** : vérification renforcée obligatoire des recruteurs (KYC 3 organisationnel), recruteur
  non vérifié sans aucun accès aux mineurs, mise en relation tracée par l'organisation ou le tuteur,
  jamais de contact direct avec un mineur, consultations visibles du tuteur, signalement sous 48 h.
- **État** : prévu.
- **Risque résiduel** : Moyen. Un recruteur réel peut agir de mauvaise foi ; la traçabilité permet
  de le prouver et de le révoquer.
- **Lot de vérification** : 1.4, 1.10b, 1.13, 4.4 et 4.5 (messagerie encadrée).

## 4. Certification frauduleuse de performances

- **Scénario** : un centre certifie des résultats gonflés, ou son compte est compromis pour
  certifier en masse.
- **Impact** : Moyen. Le badge « certifié » perd sa valeur.
- **Mesures** : 2FA obligatoire pour les centres, empreinte de la preuve, signature de session,
  bornes de valeurs, contrôle statistique des valeurs aberrantes, certification révocable,
  journal d'audit chaîné (vérifié et ancré hors de la base depuis le lot 1.16a).
- **État** : prévu.
- **Risque résiduel** : Moyen jusqu'au contrôle statistique (lot 3.6), Faible ensuite.
- **Lot de vérification** : 1.3 (2FA), 2.1, 2.2, 3.6.

## 5. Inscription massive automatisée

- **Scénario** : un robot crée des milliers de comptes pour polluer la base, épuiser les SMS ou
  dévaluer la recherche.
- **Impact** : Moyen. Coûts SMS, données polluées.
- **Mesures** : reCAPTCHA v3, champ piège et chronométrie, limitation de débit (3 inscriptions par
  heure et par IP), vérification email puis SMS, plafonds d'envoi par IP, compte et numéro, liste blanche d'indicatifs,
  score de risque, limite globale Cloudflare.
- **Limite connue** : le plafond par numéro peut servir à bloquer un tiers 24 h (D-084).
- **État** : partiel (lots 1.3ca et 1.3cc) ; score de risque et Cloudflare prévus.
- **Risque résiduel** : Faible.
- **Lot de vérification** : 1.3, 1.17 (tests de charge), 1.18 (Cloudflare).

## 6. Escalade de privilèges

- **Scénario** : un utilisateur authentifié modifie un identifiant dans une requête pour lire ou
  modifier un profil hors de sa portée, ou s'attribuer un rôle.
- **Impact** : Élevé. Accès à toute la base d'identité.
- **Mesures** : refus par défaut, CASL et RLS alignés sur la matrice des droits, test « rôle non
  autorisé → 403 » obligatoire pour chaque endpoint, identifiants UUIDv7 non devinables, rôles
  PostgreSQL séparés pour l'application et les migrations, 2FA des rôles sensibles, revue
  adversariale de chaque lot.
- **État** : partiel. Refus par défaut, CASL et test par route en place (lot 1.4a) ; RLS de
  lecture des joueurs alignée et vues par rôle en place (lot 1.4b) ; rôles PostgreSQL séparés,
  D-038. Lot 1.16a : une altération du journal d'audit, même par un administrateur de la base, est
  détectée par la vérification quotidienne contre une ancre tenue hors de la base
  ([audit.md](audit.md)).
- **Risque résiduel** : Faible une fois la matrice exhaustive verte.
- **Lot de vérification** : 1.1, 1.4, test d'intrusion du lot 1.17.

## 7. Téléversement malveillant

- **Scénario** : un fichier piégé (exécutable déguisé, PDF malveillant, image polyglotte) est
  déposé comme pièce d'identité ou preuve.
- **Impact** : Élevé. Compromission serveur, distribution de logiciel malveillant aux agents de
  vérification.
- **Mesures** : antivirus ClamAV en file d'attente, vérification du type MIME réel, ré-encodage des
  images, taille limitée (50 Mo), stockage hors du domaine applicatif, URL signées de 5 minutes,
  jamais d'URL publique.
- **État** : en cours. Lot 1.9a : dépôt direct par URL signée de 5 minutes (type, taille et SHA-256 signés), type réel lu sur les octets de tête, rejet et alerte d'un fichier déguisé, quarantaine, bucket privé ([documents.md](documents.md)). Lot 1.9b : worker isolé sous le rôle `oz_worker` — ClamAV (EICAR rejeté, rien ne subsiste, alerte), SHA-256 recomparée, images ré-encodées sans métadonnées ni charge annexe, bornes de dimensions lues avant décodage, PDF de 1 à 20 pages lus sans rendu ni JavaScript, verdict unique et audité ; image conteneur distroless non-root. Lot 1.9ca : lecture par URL GET signée de 5 minutes, pièce saine seulement (404 uniforme sinon), type et téléchargement imposés par la signature, chaque délivrance auditée ([documents.md](documents.md)). Lot 1.9cb : purge programmée des pièces échues (fichier supprimé, empreinte et métadonnées conservées, audit), lecture fermée dès l'échéance et purge 5 minutes au moins après la dernière URL délivrée, objets orphelins supprimés sur désignation de la base, analyses abandonnées relancées puis closes ; parcours n° 10 (fichier infecté → rejet + alerte) de bout en bout. Restent le PDF hostile bloquant (D-093), `/Count` sous-déclaré (D-094) et la purge des versions d'objets et copies de secours (ADR-008, lot 1.10).
- **Risque résiduel** : Faible.
- **Lot de vérification** : 1.9.

## 8. Aspiration de la base par un concurrent

- **Scénario** : un compte payant ou une série de comptes parcourt systématiquement la recherche
  pour copier les profils.
- **Impact** : Moyen. Perte de l'avantage du premier entrant.
- **Mesures** : quotas par palier d'abonnement, limitation de débit (60 recherches par minute),
  pagination par curseur, détection de comportement d'aspiration, filigrane des exports et des PDF,
  aucun profil de mineur accessible sans authentification.
- **État** : prévu.
- **Risque résiduel** : Moyen. Une aspiration lente et répartie reste difficile à distinguer d'un
  usage normal.
- **Lot de vérification** : 1.14, 2.10, 3.4.

## Révision

Ce modèle est relu :

- à la fin de chaque lot qui livre une mesure ci-dessus (l'état passe de « prévu » à « en place »
  avec sa preuve dans la [politique](policy.md)) ;
- à chaque incident ou vulnérabilité signalée ([SECURITY.md](../../SECURITY.md)) ;
- avant la recette (lot 1.17) et avant la mise en production (lot 1.18) ;
- au moins une fois par trimestre.

Une nouvelle menace s'ajoute à la suite, avec la même structure.

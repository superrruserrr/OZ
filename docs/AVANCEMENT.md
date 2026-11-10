# OZ — Où en est le projet ?

> Check-list tenue à jour à la fin de chaque étape, à transmettre telle quelle à Fabrice Olinga.
> **Dernière mise à jour : 10 novembre 2026** — étape : 1.5a Charte graphique OZ Football ID appliquée.

Légende : ✅ fait et vérifié · 🟡 en cours · ⬜ à faire · ⏸️ bloqué en attente d'une décision

## En une phrase

Les fondations techniques sont posées ; le **coffre des documents d'identité** et les **droits RGPD**
(journal, export, suppression) sont terminés. Il
reste à construire tout ce que les utilisateurs verront (écrans, inscription, profils, recherche) et
la vérification d'identité, qui attend deux décisions (§ « Ce qui bloque »).

## Phase 0 — Fondations (11 étapes)

| Étape                                                | État | Ce que ça veut dire pour le produit                            |
| ---------------------------------------------------- | ---- | -------------------------------------------------------------- |
| 0.1 Organisation du code et contrôles qualité        | ✅   | Chaque modification est vérifiée automatiquement               |
| 0.2 Environnement de travail                         | ✅   | Le projet démarre à l'identique sur tout poste                 |
| 0.3 Serveur de l'application (API)                   | ✅   | La « salle des machines » existe                               |
| 0.4 Site web (squelette)                             | ✅   | La base du site existe                                         |
| 0.5 Règles communes site / serveur                   | ✅   | Un formulaire est vérifié deux fois : à l'écran et au serveur  |
| 0.6 Base de données                                  | ✅   | Les données ont leur coffre                                    |
| 0.7 Vérifications automatiques à chaque modification | ✅   | 6 contrôles automatiques (tests, sécurité…) doivent être verts |
| 0.8 Hébergement (a, b)                               | ✅   | Serveurs et stockage à Paris décrits et sécurisés              |
| 0.8 Hébergement (c, d : mise en ligne de test)       | ⬜   | Reporté : la version de test en ligne n'existe pas encore      |
| 0.9 Surveillance (alertes, erreurs)                  | ⬜   | Reporté avec la version de test en ligne                       |
| 0.10 Charte graphique de base                        | ✅   | Couleurs, polices, composants de base                          |
| 0.11 Documentation fondatrice                        | ✅   | Règles de sécurité et de contribution écrites                  |

## Phase 1 — Première version ouverte au public (20 étapes)

| Étape                                                    | État | Ce que ça veut dire pour le produit                                                                 |
| -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| 1.1 Modèle des données (joueurs, tuteurs, organisations) | ✅   | Toutes les fiches sont prévues, les données d'identité chiffrées                                    |
| 1.2 Identifiant OZ ID                                    | ✅   | Chaque joueur reçoit un identifiant unique, à vie, infalsifiable                                    |
| 1.3 Connexion et sécurité des comptes                    | ✅   | Mot de passe, double authentification, sessions sécurisées                                          |
| 1.4 Rôles et droits                                      | ✅   | Chacun ne voit que ce qu'il a le droit de voir (règles de l'Annexe B)                               |
| 1.5 Charte graphique complète et écrans de base          | 🟡   | 1.5a fait : charte OZ Football ID (logo, couleurs, police), clair et sombre ; suite attend Q16, Q18 |
| 1.6 Site public et pages légales                         | ⏸️   | Attend le juriste (Q7) et les prix (Q8)                                                             |
| 1.7 Inscription joueur                                   | ⬜   | Après 1.5                                                                                           |
| 1.7b Tuteur légal (mineurs)                              | ⬜   | Après 1.7                                                                                           |
| 1.8 Inscription organisation (académie, club…)           | ⬜   | Après 1.5                                                                                           |
| 1.9 Coffre des documents d'identité                      | ✅   | Dépôt sécurisé, antivirus, lecture 5 minutes, effacement automatique                                |
| 1.10 Vérification d'identité (badge « Profil vérifié »)  | ⏸️   | Attend l'analyse d'impact validée et le choix du prestataire                                        |
| 1.10b Vérification des recruteurs et organisations       | ⏸️   | Attend Q2 et l'étape 1.10                                                                           |
| 1.11 Back-office d'administration                        | ⬜   | Après 1.10                                                                                          |
| 1.12 Import de joueurs en masse                          | ⬜   | Après 1.7                                                                                           |
| 1.13 Profil joueur public                                | 🟡   | 1.13a et 1.13b faits (fiche, QR, carte, PDF) ; restent les écrans                                   |
| 1.14 Recherche                                           | 🟡   | 1.14a et 1.14b faites côté serveur (recherche, sauvegarde, CSV) ; restent les écrans (1.13c)        |
| 1.15 Notifications et emails                             | ⬜   | Après 1.7                                                                                           |
| 1.16 Journal et conformité données (RGPD)                | ✅   | Journal, export, suppression (aussi par le tuteur), registre RGPD                                   |
| 1.17 Tests de charge et recette                          | ⬜   | Fin de phase                                                                                        |
| 1.18 Mise en production                                  | ⬜   | Fin de phase                                                                                        |

**Bilan Phase 1 : 6 étapes sur 20 terminées, 3 en cours (1.5 : 1 partie ; 1.13 : 2 parties sur 3 ; 1.14 : serveur fait, écrans en 1.13c).**

### Étape 1.5 en détail

| Partie                                  | État | Ce que ça veut dire pour le produit                                                                            |
| --------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| 1.5a Charte graphique OZ Football ID    | ✅   | Logo, couleurs et police de la charte sur le site et le back-office ; mode clair, ou sombre selon le téléphone |
| 1.5b Composants, coquille et navigation | ⬜   | Écrans de base communs (menus par rôle, chargement, erreurs) ; attend Q16 et Q18                               |

Q6 (un seul système visuel) et Q19 (nom « OZ FOOTBALL ID ») sont tranchées par la charte (ADR-009).

### Étape 1.13 en détail

| Partie                                 | État | Ce que ça veut dire pour le produit                                                                 |
| -------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| 1.13a Fiche joueur et visibilité (API) | ✅   | Chacun reçoit seulement ce que son rôle permet ; badge de vérification ; le joueur masque des blocs |
| 1.13b QR code et export PDF            | ✅   | Carte OZ ID avec QR (sans photo pour l'instant) ; fiche PDF filigranée au nom de qui la télécharge  |
| 1.13c Écrans de la fiche               | ⏸️   | Attend la charte complète (1.5)                                                                     |

### Étape 1.14 en détail

| Partie                                  | État | Ce que ça veut dire pour le produit                                                                      |
| --------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| 1.14a Recherche de joueurs (serveur)    | ✅   | Clubs, fédérations et académies trouvent un joueur par critères ; un recruteur non vérifié, aucun mineur |
| 1.14b Recherches sauvegardées et export | ✅   | Sauvegarder une recherche ; export CSV filigrané au nom du demandeur, limité (palier gratuit, Q8)        |

### Étape 1.16 en détail

| Partie                                   | État | Ce que ça veut dire pour le produit                                                          |
| ---------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| 1.16a Journal d'audit infalsifiable      | ✅   | Toute action sensible est tracée ; une falsification, même par un technicien, est repérée    |
| 1.16ba Demande d'export et inventaire    | ✅   | Chacun demande l'export de ses données (mot de passe redemandé) ; tout est inventorié        |
| 1.16bb Archive téléchargeable            | ✅   | L'archive est préparée, envoyée par lien sécurisé, puis effacée                              |
| 1.16ca Suppression de compte (base, API) | ✅   | Chacun demande la suppression ; 30 jours pour annuler ; données anonymisées, OZ ID gardé     |
| 1.16cba Suppression exécutée             | ✅   | Suppression lancée seule à l'échéance ; fiche cachée pendant les 30 jours ; fichiers effacés |
| 1.16cbb Suppression par le tuteur        | ✅   | Un parent supprime la fiche de son enfant ; parcours complet testé ; registre RGPD rédigé    |

## Ce qui bloque — décisions attendues

### De Fabrice

| N°  | Question                                                                                                                                                                                                                                                                      | Pour débloquer |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Q2  | La vérification des recruteurs et organisations est-elle bien dans la première version ?                                                                                                                                                                                      | 1.10b          |
| Q7  | Qui rédige la politique de confidentialité et les CGU (juriste) ?                                                                                                                                                                                                             | 1.6, ouverture |
| Q8  | Prix des formules et quotas de chacune ; en attendant, palier gratuit appliqué : 3 exports CSV par jour et 200 lignes par organisation, aucun export pour une académie                                                                                                        | 1.6, 1.14      |
| Q15 | OZ Performance et le tableau de bord en Phase 2 (et non Phase 1) : d'accord ?                                                                                                                                                                                                 | Planning       |
| Q16 | Le site web adapté au mobile suffit-il pour l'ouverture (application en Phase 2) ?                                                                                                                                                                                            | 1.5            |
| Q18 | Retirer l'« OZ Score » des écrans de la première version ?                                                                                                                                                                                                                    | 1.5            |
| Q20 | Quelle société encaisse et facture (Québec, Cameroun, autre) ?                                                                                                                                                                                                                | 1.6, paiements |
| Q21 | Suppression de compte : 30 jours pour changer d'avis (fiche cachée), compte suspendu gelé, puis anonymisation ; par le tuteur pour un mineur, annulée à sa majorité (D1 à D15) ?                                                                                              | À confirmer    |
| Q22 | Fiche en PDF : tout lecteur autorisé télécharge sa vue, filigranée à son nom ; carte OZ ID sans photo pour l'instant (D1 à D4 du lot 1.13b) ?                                                                                                                                 | À confirmer    |
| Q23 | Recherche : une académie ne filtre ni sur la taille, le poids, ni le pied fort ; nul ne filtre sur l'organisation d'un autre ; texte libre sur le nom (encore lent à grande échelle) ; chaque mineur listé à un lecteur journalisé laissé au journal (D1 à D6 du lot 1.14a) ? | À confirmer    |
| Q24 | Logo : le slogan des fichiers fournis est « Beyong potential » ; faut-il lire « Beyond potential » (anglais correct) avant toute impression ?                                                                                                                                 | 1.5            |

### De Gaëtan (et du juriste)

| Sujet                                  | État                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Analyse d'impact (AIPD)                | 🟡 Brouillon écrit (`docs/security/aipd.md`) : 8 questions au juriste       |
| Registre des traitements (RGPD)        | 🟡 Brouillon (`docs/security/gdpr-register.md`) : bases légales à confirmer |
| Choix du prestataire d'identité        | ⬜ Essai Veriff / Smile ID sans données réelles, au début de 1.10           |
| Q17 Format de l'identifiant OZ ID      | ⬜ Le plan prévaut, maquettes à corriger                                    |
| Version de test en ligne (0.8c/d, 0.9) | ⬜ Reportée                                                                 |

## Chiffres clés

- 6 contrôles automatiques au vert exigés avant chaque intégration.
- Dernière mesure complète : plus de 2 500 tests automatiques, 97 % du code couvert par les tests.
- 109 points techniques notés à reprendre plus tard (dette suivie dans `DEBT.md`).

## Historique des mises à jour

| Date       | Étape terminée                                             |
| ---------- | ---------------------------------------------------------- |
| 2026-11-03 | Création de la check-list ; brouillon AIPD                 |
| 2026-11-03 | 1.9 Coffre des documents d'identité (effacement auto)      |
| 2026-11-03 | 1.16a Journal d'audit infalsifiable (étape 1.16 en cours)  |
| 2026-11-03 | 1.13a Fiche joueur et visibilité (étape 1.13 en cours)     |
| 2026-11-03 | 1.16ba Demande d'export des données (1.16 en cours)        |
| 2026-11-03 | 1.16bb Archive d'export téléchargeable (1.16 en cours)     |
| 2026-11-03 | 1.16ca Suppression de compte (1.16 en cours)               |
| 2026-11-09 | 1.16cba Suppression exécutée à l'échéance (1.16 en cours)  |
| 2026-11-09 | 1.16cbb Suppression par le tuteur, registre RGPD (1.16 ✅) |
| 2026-11-09 | 1.13b QR, carte OZ ID et fiche PDF (1.13 en cours)         |
| 2026-11-09 | 1.14a Recherche de joueurs, côté serveur (1.14 en cours)   |
| 2026-11-10 | 1.5a Charte graphique OZ Football ID (1.5 en cours)        |
| 2026-11-10 | 1.14b Recherches sauvegardées et export CSV (1.14 serveur) |

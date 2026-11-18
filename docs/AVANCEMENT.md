# OZ — Où en est le projet ?

> Check-list tenue à jour à la fin de chaque étape, à transmettre telle quelle à Fabrice Olinga.
> **Dernière mise à jour : 17 novembre 2026** — étape : 1.5ec Tableau de bord du joueur et du tuteur (refonte 1.5e terminée).

Légende : ✅ fait et vérifié · 🟡 en cours · ⬜ à faire · ⏸️ bloqué en attente d'une décision

## En une phrase

Les fondations techniques sont posées ; le **coffre des documents d'identité** et les **droits RGPD**
(journal, export, suppression) sont terminés. Il
reste à construire tout ce que les utilisateurs verront (écrans, inscription, profils, recherche) et
la vérification d'identité, qui attend deux décisions (§ « Ce qui bloque »).

## Première mise en ligne — périmètre validé le 17 novembre

Décision de Gaëtan (ADR-013) : on ouvre **sans vérification d'identité ni badge « Profil vérifié »**.
La vérification d'identité (1.10) vient juste après l'ouverture. C'est un écart volontaire à l'ordre
prévu par le plan technique, qui la plaçait avant le back-office et l'ouverture. La fiche d'un mineur
reste cachée tant que le justificatif de son tuteur n'est pas validé ; elle est publiée dès que le
justificatif est validé et que le tuteur a donné son accord (décision du 17 novembre).

| Ordre | Étape                                                                 | État |
| ----- | --------------------------------------------------------------------- | ---- |
| 1     | 1.5cbb Connexion, choix du compte, inscription au nouveau style       | ✅   |
| 1 bis | 1.5e Textes plus doux, chargement multisport, statistiques, accueil   | ✅   |
| 2     | 1.19 Ouverture, en un seul bloc :                                     | 🟡   |
|       | · espace du joueur : sa fiche, ce qu'il montre, export, suppression   | ⬜   |
|       | · espace du tuteur : enfants, justificatif, accord                    | ⬜   |
|       | · back-office réduit : comptes, justificatifs des tuteurs, suspension | ⬜   |
|       | · emails essentiels                                                   | ⬜   |
|       | · fiche d'un mineur publiée après justificatif validé et accord       | ✅   |
| 3     | 0.8c/d et 0.9 Version de test et de production en ligne, surveillance | ⬜   |
| 4     | 1.17 Recette, puis 1.18 mise en production                            | ⬜   |

Avant l'ouverture, hors code : relecture par le juriste de l'analyse d'impact et des CGU ; test
d'intrusion par une société externe recommandé.

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
| 0.8 Hébergement (c, d : mise en ligne de test)       | ⬜   | Avant l'ouverture (6ᵉ étape du périmètre de mise en ligne)     |
| 0.9 Surveillance (alertes, erreurs)                  | ⬜   | Avec la version de test en ligne, avant l'ouverture            |
| 0.10 Charte graphique de base                        | ✅   | Couleurs, polices, composants de base                          |
| 0.11 Documentation fondatrice                        | ✅   | Règles de sécurité et de contribution écrites                  |

## Phase 1 — Première version ouverte au public (20 étapes)

| Étape                                                    | État | Ce que ça veut dire pour le produit                                                                         |
| -------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| 1.1 Modèle des données (joueurs, tuteurs, organisations) | ✅   | Toutes les fiches sont prévues, les données d'identité chiffrées                                            |
| 1.2 Identifiant OZ ID                                    | ✅   | Chaque joueur reçoit un identifiant unique, à vie, infalsifiable                                            |
| 1.3 Connexion et sécurité des comptes                    | ✅   | Mot de passe, double authentification, sessions sécurisées                                                  |
| 1.4 Rôles et droits                                      | ✅   | Chacun ne voit que ce qu'il a le droit de voir (règles de l'Annexe B)                                       |
| 1.5 Charte graphique complète et écrans de base          | ✅   | Tout le site au style « sport » noir et lime, écrans de compte compris ; audit final passé                  |
| 1.6 Site public et pages légales                         | ✅   | Accueil, 7 pages profils, tarifs, à propos, contact, textes légaux provisoires ; testé 320 px               |
| 1.7 Inscription joueur                                   | ✅   | Compte, identité, sport, tuteur et OZ ID à l'écran ; email renvoyé, mot de passe oublié, carte avec QR      |
| 1.7b Tuteur légal (mineurs)                              | ✅   | Invitation, justificatif, accord et retrait, à l'écran ; fiche non publiée avant la vérification d'identité |
| 1.8 Inscription organisation (académie, club…)           | ⬜   | Après 1.5                                                                                                   |
| 1.9 Coffre des documents d'identité                      | ✅   | Dépôt sécurisé, antivirus, lecture 5 minutes, effacement automatique                                        |
| 1.10 Vérification d'identité (badge « Profil vérifié »)  | ⏸️   | Après l'ouverture (ADR-013) ; attend l'analyse d'impact validée et le choix du prestataire                  |
| 1.10b Vérification des recruteurs et organisations       | ⏸️   | Attend l'étape 1.10 (Q2 tranchée : incluse)                                                                 |
| 1.11 Back-office d'administration                        | ⬜   | Version réduite avant l'ouverture ; file de vérification d'identité après 1.10                              |
| 1.12 Import de joueurs en masse                          | ⬜   | Après 1.7                                                                                                   |
| 1.13 Profil joueur public                                | 🟡   | 1.13a et 1.13b faits (fiche, QR, carte, PDF) ; restent les écrans                                           |
| 1.14 Recherche                                           | 🟡   | 1.14a et 1.14b faites côté serveur (recherche, sauvegarde, CSV) ; restent les écrans (1.13c)                |
| 1.15 Notifications et emails                             | ⬜   | Emails essentiels avant l'ouverture ; le reste ensuite                                                      |
| 1.16 Journal et conformité données (RGPD)                | ✅   | Journal, export, suppression (aussi par le tuteur), registre RGPD                                           |
| 1.17 Tests de charge et recette                          | ⬜   | Fin de phase                                                                                                |
| 1.18 Mise en production                                  | ⬜   | Fin de phase                                                                                                |

**Bilan Phase 1 : 11 étapes sur 20 terminées, 2 en cours (1.13 : 2 parties sur 3 ; 1.14 : serveur fait, écrans en 1.13c).**

### Étape 1.5 en détail

| Partie                                 | État | Ce que ça veut dire pour le produit                                                                                   |
| -------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| 1.5a Charte graphique OZ Football ID   | ✅   | Logo, couleurs et police de la charte sur le site et le back-office ; mode clair, ou sombre selon le téléphone        |
| 1.5ba Composants des écrans            | ✅   | Briques des écrans : étapes, code SMS, choix du compte, encadrés tuteur, filtres, onglets, chargement, carte OZ ID    |
| 1.5bb Coquille et navigation           | ✅   | Menus par rôle, écrans de chargement et d'erreur, effets du site, audit mobile et 3G                                  |
| 1.5ca Refonte « sport » : briques      | ✅   | Site tout en sombre, héros de stade, cartes vitrées, panneau « en direct », nouveaux menus ; testé mobile et fluidité |
| 1.5cc Thème noir et lime, police douce | ✅   | Briques en noir et lime, police douce type Helvetica, tuiles de stats, anneaux, terrain, cadres photo et pub          |
| 1.5cba Refonte : pages publiques       | ✅   | Accueil, profils, tarifs, à propos, contact et textes légaux au nouveau style, menu mobile                            |
| 1.5da Kit sport                        | ✅   | Icônes de 7 sports, écussons de club génériques, animation de chargement avec un ballon qui rebondit                  |
| 1.5db Accueil en landing page          | ✅   | Mission expliquée, aperçu d'une fiche d'exemple, parcours en 3 étapes, questions fréquentes, données pour Google      |
| 1.5dc Annuaire et fiche joueur         | ✅   | Recherche de joueurs, fiche avec sections qui s'ouvrent au clic, drapeaux ; démo locale avec compte de test           |
| 1.5cbb Refonte : compte et inscription | ✅   | Connexion, choix du compte, inscription et premiers pas au nouveau style ; audit final                                |
| 1.5ea Textes plus doux, chargement     | ✅   | Titres environ 20 % plus petits, texte à 15 px ; le logo s'ouvre en trois balles, seulement si la page tarde          |
| 1.5eb Statistiques façon jeu de foot   | ✅   | Hexagone, jauges et barres ; seulement des données réelles, rien d'inventé                                            |
| 1.5ec Tableau de bord joueur et tuteur | ✅   | Toutes les rubriques ; celles pas encore livrées en cartes « Bientôt disponible »                                     |

Q6 (un seul système visuel) et Q19 (nom « OZ FOOTBALL ID ») sont tranchées par la charte (ADR-009).

### Étape 1.13 en détail

| Partie                                 | État | Ce que ça veut dire pour le produit                                                                 |
| -------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| 1.13a Fiche joueur et visibilité (API) | ✅   | Chacun reçoit seulement ce que son rôle permet ; badge de vérification ; le joueur masque des blocs |
| 1.13b QR code et export PDF            | ✅   | Carte OZ ID avec QR (sans photo pour l'instant) ; fiche PDF filigranée au nom de qui la télécharge  |
| 1.13c Espace du joueur                 | ⬜   | Fiche, visibilité, export et suppression ; après 1.5cbb                                             |

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

Conformité (données, mineurs, identité) : check-list et décisions C1 à C9 (validées le
17 novembre) dans `docs/CONFORMITE.md`.

### De Fabrice

| N°  | Question                                                                                                             | Pour débloquer   |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Q7  | Confidentialité et CGU : textes provisoires rédigés (`docs/legal/`) ; à faire relire par un juriste en fin de projet | Production       |
| Q8  | Prix : grille provisoire proposée (`docs/legal/tarifs-provisoires.md`) ; prix définitifs à fournir en fin de projet  | Paiements        |
| Q20 | Quelle société encaisse et facture (Québec, Cameroun, autre) ?                                                       | 1.6, paiements   |
| Q24 | Logo : « Beyond potential » confirmé ; fichiers du logo corrigés (PNG et SVG) à demander au graphiste                | Impression, 1.5b |

### De Gaëtan (et du juriste)

| Sujet                                  | État                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Analyse d'impact (AIPD)                | 🟡 Brouillon écrit (`docs/security/aipd.md`) : 8 questions au juriste       |
| Textes d'accord du tuteur (C1)         | ✅ Validés pour la recette ; relecture du juriste avant la production       |
| Relecture des justificatifs (C5)       | 🟡 Procédure validée ; noms des deux administrateurs à fournir              |
| Registre des traitements (RGPD)        | 🟡 Brouillon (`docs/security/gdpr-register.md`) : bases légales à confirmer |
| Choix du prestataire d'identité        | ⬜ Essai Veriff / Smile ID sans données réelles, au début de 1.10           |
| Q17 Format de l'identifiant OZ ID      | ⬜ Le plan prévaut, maquettes à corriger                                    |
| Version de test en ligne (0.8c/d, 0.9) | ⬜ Avant l'ouverture (ADR-013)                                              |
| Test d'intrusion externe               | ⬜ Recommandé avant l'ouverture : société à choisir                         |

## Chiffres clés

- 6 contrôles automatiques au vert exigés avant chaque intégration.
- Dernière mesure complète : plus de 2 500 tests automatiques, 97 % du code couvert par les tests.
- 110 points techniques notés à reprendre plus tard (dette suivie dans `DEBT.md`).

## Historique des mises à jour

| Date       | Étape terminée                                                   |
| ---------- | ---------------------------------------------------------------- |
| 2026-11-03 | Création de la check-list ; brouillon AIPD                       |
| 2026-11-03 | 1.9 Coffre des documents d'identité (effacement auto)            |
| 2026-11-03 | 1.16a Journal d'audit infalsifiable (étape 1.16 en cours)        |
| 2026-11-03 | 1.13a Fiche joueur et visibilité (étape 1.13 en cours)           |
| 2026-11-03 | 1.16ba Demande d'export des données (1.16 en cours)              |
| 2026-11-03 | 1.16bb Archive d'export téléchargeable (1.16 en cours)           |
| 2026-11-03 | 1.16ca Suppression de compte (1.16 en cours)                     |
| 2026-11-09 | 1.16cba Suppression exécutée à l'échéance (1.16 en cours)        |
| 2026-11-09 | 1.16cbb Suppression par le tuteur, registre RGPD (1.16 ✅)       |
| 2026-11-09 | 1.13b QR, carte OZ ID et fiche PDF (1.13 en cours)               |
| 2026-11-09 | 1.14a Recherche de joueurs, côté serveur (1.14 en cours)         |
| 2026-11-10 | 1.5a Charte graphique OZ Football ID (1.5 en cours)              |
| 2026-11-10 | 1.14b Recherches sauvegardées et export CSV (1.14 serveur)       |
| 2026-11-10 | Réponses de Fabrice (Q2, Q15, Q16, Q18, Q21 à Q24)               |
| 2026-11-10 | Textes légaux et tarifs provisoires (Q7, Q8)                     |
| 2026-11-11 | 1.5ba Composants des écrans (1.5 en cours)                       |
| 2026-11-11 | 1.5bb Coquille, navigation et audit (1.5 ✅)                     |
| 2026-11-11 | 1.6 Site public et pages légales (1.6 ✅)                        |
| 2026-11-11 | 1.7a Inscription joueur, côté serveur (1.7 en cours)             |
| 2026-11-10 | 1.7ca Connexion au site et création de compte (1.7 en cours)     |
| 2026-11-10 | 1.7cb Parcours d'inscription joueur à l'écran (1.7 ✅)           |
| 2026-11-10 | 1.5ca Refonte « sport », briques ; thème noir et lime choisi     |
| 2026-11-11 | 1.5cc Thème noir et lime, police douce (1.5 en cours)            |
| 2026-11-11 | 1.5cba Refonte, pages publiques (1.5 en cours)                   |
| 2026-11-11 | 1.5da Kit sport : icônes, écussons, chargement animé             |
| 2026-11-11 | 1.5db Accueil en landing page (mission, aperçu, FAQ, SEO)        |
| 2026-11-11 | 1.5dc Annuaire et fiche joueur, démonstration locale             |
| 2026-11-11 | 1.7cc Email renvoyé, mot de passe oublié, carte OZ ID avec QR    |
| 2026-11-16 | 1.7ba Tuteur légal : invitation et compte (1.7b en cours)        |
| 2026-11-17 | 1.7bb Tuteur légal : justificatif et accord (1.7b en cours)      |
| 2026-11-17 | 1.7bc Tuteur légal : écrans et retrait du lien (1.7b ✅)         |
| 2026-11-17 | Périmètre de la première mise en ligne sans KYC (ADR-013)        |
| 2026-11-17 | 1.5cbb Refonte des écrans de compte, audit final (1.5 ✅)        |
| 2026-11-17 | 1.19a Mineur publié et droits du tuteur sans KYC (1.19 en cours) |
| 2026-11-17 | 1.5ea Textes plus doux, chargement multisport (1.5e en cours)    |
| 2026-11-18 | 1.5eb Statistiques façon jeu de foot (1.5e en cours)             |

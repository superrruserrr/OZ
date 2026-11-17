# OZ — Conformité : où en est-on, que reste-t-il ?

> Check-list de conformité (données personnelles, mineurs, vérification d'identité), tenue à jour
> avec `docs/AVANCEMENT.md`. Rédigée par l'équipe technique : **ce n'est pas un avis juridique**.
> Chaque point « juriste » doit être confirmé par un professionnel avant la production.
> **Dernière mise à jour : 17 novembre 2026** (lot 1.7bc).

Légende : ✅ fait et vérifié · 🟡 en cours · ⬜ à faire · ⏸️ en attente d'une décision

## Le principe : trois paliers

Comme pour les phases du plan, un palier ne s'ouvre que lorsque le précédent est validé.

1. **Pendant le développement** : la conformité est intégrée au code et vérifiée par les tests.
2. **Avant la recette** (version de test avec de vraies personnes) : textes validés, procédures
   écrites, analyse d'impact relue.
3. **Avant la production** (ouverture au public) : contrats signés, vérification d'identité en
   service, droits des personnes testés de bout en bout.

## Palier 1 — Pendant le développement

| Sujet                                       | État | Où le voir                                                                |
| ------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| Registre des traitements, tenu à chaque lot | ✅   | `docs/security/gdpr-register.md` (un test bloque toute table oubliée)     |
| Données sensibles chiffrées, accès limités  | ✅   | Chiffrement par colonne, règles d'accès en base (`docs/security/rbac.md`) |
| Journal de preuve inaltérable               | ✅   | Journal d'audit chaîné (`docs/security/audit.md`)                         |
| Pièces analysées, lues 5 min, purgées       | ✅   | Coffre documentaire (`docs/security/documents.md`)                        |
| Droits des personnes : export, suppression  | ✅   | `docs/security/data-export.md`, `docs/security/account-deletion.md`       |
| Mineur jamais publié sans tuteur vérifié    | ✅   | Règle en base (CP-13), testée                                             |
| Lien parent-enfant prouvé, revu par OZ      | ✅   | Lot 1.7bb (`docs/security/guardian.md`)                                   |
| Accord parental versionné et révocable      | ✅   | Lot 1.7bb : texte gardé, heure du serveur, retrait immédiat               |
| Bases légales de chaque traitement          | 🟡   | Proposées dans le registre, **à confirmer par le juriste**                |
| Textes de consentement du tuteur            | 🟡   | Version 1 validée pour la recette (C1), provisoire jusqu'au juriste       |
| Export : dépôt et décision du justificatif  | ⬜   | Dette D-135 (les pièces et les accords sont déjà exportés)                |

## Palier 2 — Avant la recette

| Sujet                                                | État | Suite                                                         |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------- |
| Textes de consentement validés (C1)                  | ✅   | Validés pour la recette le 2026-11-17                         |
| Responsable du traitement et contact données (C2)    | 🟡   | Principe validé ; société et adresse à fournir (Q20, Fabrice) |
| Pays ouverts au lancement (C3)                       | ✅   | Cameroun seul (2026-11-17)                                    |
| Relecture juridique groupée (C4)                     | 🟡   | Principe validé ; juriste et date à fixer                     |
| Personnes habilitées à revoir les justificatifs (C5) | 🟡   | Principe validé ; noms des deux administrateurs à fournir     |
| Procédure de revue écrite (ci-dessous)               | ✅   | Validée le 2026-11-17                                         |
| Retrait d'une approbation donnée par erreur (C6)     | ✅   | Lot 1.7bc : API administrateur, motif fermé, journalisé       |
| Analyse d'impact (AIPD) relue                        | 🟡   | `docs/security/aipd.md`, 8 questions au juriste               |
| Dettes de conformité soldées ou acceptées par écrit  | 🟡   | D-134, D-135                                                  |

## Palier 3 — Avant la production

| Sujet                                                                        | État | Qui                             |
| ---------------------------------------------------------------------------- | ---- | ------------------------------- |
| Contrats de sous-traitance signés (hébergeur, identité, email, SMS)          | ⬜   | Fabrice                         |
| Transferts hors Union européenne encadrés, s'il y en a                       | ⬜   | Juriste                         |
| Vérification d'identité (KYC) en service, prestataire choisi (C7)            | ⬜   | Reprise du lot 1.10 après 1.7bc |
| Double contrôle (« quatre yeux ») pour les mineurs, prévu par l'AIPD         | ⬜   | Lots 1.10, 1.11                 |
| Parcours complet testé : inscription mineur → tuteur → accord → publication  | ⬜   | Équipe technique                |
| Droits des personnes testés en recette (accès, export, suppression, retrait) | ⬜   | Équipe technique                |
| Procédure en cas de fuite de données (notification sous 72 h)                | 🟡   | `docs/security/policy.md`       |
| Textes définitifs publiés (CGU, confidentialité, consentements)              | ⬜   | Juriste (Q7)                    |

## Décisions C1 à C9 : validées le 2026-11-17 (Gaëtan Wassu)

Propositions de l'équipe technique, toutes acceptées. Restent à fournir : la société et l'adresse
de contact (C2, Q20), le juriste et sa date (C4), les noms des deux administrateurs (C5).

| N°  | Question                                                   | Proposition de l'équipe technique                                                                                                                                                           |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Textes de consentement du tuteur (traitement, publication) | Validés tels quels pour la recette, toujours marqués « provisoire » ; version définitive après le juriste. Un changement crée une version 2 : les accords donnés sur la v1 restent prouvés. |
| C2  | Qui est responsable des données et quel contact ?          | La société qui facture (question Q20) ; une adresse email dédiée aux données personnelles, relevée chaque semaine.                                                                          |
| C3  | Pays au lancement                                          | Cameroun seul ; tout autre pays s'ajoute après une revue juridique propre à ce pays (âge du consentement, pièces d'état civil). Données hébergées dans l'Union européenne.                  |
| C4  | Relecture juridique                                        | Une seule relecture groupée avant la recette : CGU, confidentialité, mentions légales, consentements, AIPD (8 questions) et bases légales du registre.                                      |
| C5  | Qui revoit les justificatifs ?                             | Deux administrateurs nommés, validation en deux étapes obligatoire, procédure ci-dessous. Passage au double contrôle avec le KYC (lot 1.10), comme l'AIPD le prévoit.                       |
| C6  | Approbation donnée par erreur                              | Ajouter au lot 1.7bc le retrait du lien par un administrateur (motif obligatoire, journalisé, accords retirés).                                                                             |
| C7  | Vérification d'identité (lot 1.10, en pause)               | Reprendre juste après 1.7bc : essai Veriff et Smile ID en bac à sable, sans aucune donnée réelle, puis choix.                                                                               |
| C8  | Invitation du tuteur par SMS ou WhatsApp                   | Au lancement, email ou lien transmis par le joueur ; SMS au lot 1.15, avec un modèle de message à approuver.                                                                                |
| C9  | Suite du projet                                            | Lot 1.7bc (écrans du tuteur : invitation, dépôt, accord, retrait) dès la fusion du lot 1.7bb.                                                                                               |

## Procédure de revue des justificatifs (v1, validée le 2026-11-17)

Décision C5. Elle s'applique à chaque dépôt de la file `GET /admin/guardian-links`.

1. **Se récuser** si l'on connaît la famille. OZ bloque déjà le déposant et l'enfant, pas un proche.
2. **Lire les pièces dans OZ seulement** (lien valable 5 minutes). Ne jamais les télécharger, les
   copier ou les faire suivre.
3. **Comparer avec la déclaration :**
   - l'enfant : prénom, nom et date de naissance identiques à ceux de la fiche ;
   - le parent : son nom figure sur l'acte de naissance ou le livret de famille, comme mère ou père ;
   - un tuteur légal (ou « autre ») : le jugement de tutelle le nomme et désigne l'enfant.
4. **Contrôler la pièce :** complète (toutes les pages), lisible, non rognée, cohérente (dates,
   tampons, mise en page).
5. **Décider, avec le motif de la liste fermée :**
   - tout concorde → **approuver** ;
   - pièce floue, incomplète → `illegible` (le parent peut redéposer) ;
   - nom du parent différent → `name_mismatch` ;
   - enfant différent → `child_mismatch` ;
   - pièce hors liste → `wrong_document` ;
   - **indices concrets** de falsification (retouche, incohérence manifeste) → `suspected_forgery`,
     qui clôt le rattachement et alerte la sécurité. Un simple doute n'est pas un indice : choisir
     `illegible` et demander une nouvelle pièce.
6. **Délai cible :** 2 jours ouvrés après le dépôt.
7. **Ne jamais contacter la famille hors d'OZ.** L'email de décision part automatiquement.

Rappel : approuver le lien ne publie rien. La fiche de l'enfant ne devient visible des
organisations qu'après la vérification d'identité du tuteur (KYC 2) et son accord à la publication.

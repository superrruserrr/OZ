# Grille tarifaire provisoire — OZ Football ID

> **Statut : provisoire, non validée.** Proposée le 2026-11-10 par l'équipe technique à la demande
> de Fabrice Olinga (Q8), qui fournira les prix définitifs en fin de projet. Elle sert à la page
> tarifs (lot 1.6) et aux tests ; **aucun paiement n'est encaissé avant le lot 2.10**. Formules du DP
> §13.3 (`requirements.md`, EX-210). Taxes [À COMPLÉTER selon l'entité qui facture, Q20].

## Principes

- Un joueur n'a jamais à payer pour exister et être découvert (formule Joueur — Gratuit).
- Prix en francs CFA (XAF) pour le Cameroun, payables par mobile money ; prix en euros pour les
  organisations étrangères, par carte.
- Abonnement mensuel ; abonnement annuel = 10 mois payés pour 12.
- Les quotas sont appliqués par le serveur et relus en base à chaque requête (`subscriptions.quotas`).
- Une organisation sans abonnement est au palier gratuit (quotas du lot 1.14b, seuls appliqués en
  Phase 1).

## Joueurs

| Formule          | XAF / mois | EUR / mois | Contenu                                                                    |
| ---------------- | ---------: | ---------: | -------------------------------------------------------------------------- |
| Joueur — Gratuit |          0 |          0 | OZ ID, fiche, badge vérifié, carte OZ ID, découverte par les organisations |
| Joueur — Premium |      1 000 |       2,99 | Mise en avant dans les résultats, statistiques avancées (Phase 2)          |

## Organisations (académies, clubs, centres, recruteurs)

| Formule                   | XAF / mois | EUR / mois | Joueurs gérés | Utilisateurs | Recherche                            | Exports CSV par jour | Lignes par export | Recherches sauvegardées |
| ------------------------- | ---------: | ---------: | ------------: | -----------: | ------------------------------------ | -------------------: | ----------------: | ----------------------: |
| Gratuit (sans abonnement) |          0 |          0 |            30 |            1 | Critères de base                     |                    3 |               200 |                      20 |
| Découverte                |     15 000 |         29 |           100 |            3 | Critères de base                     |                   10 |               500 |                      20 |
| Pro                       |     50 000 |         89 |           500 |           10 | Recherche avancée, statistiques      |                   30 |             1 000 |                      20 |
| Élite / Institution       |    150 000 |        249 |   Sans limite |  Sans limite | Comparaison complète, accompagnement |                  100 |             1 000 |                      20 |

- **Fédérations :** offre sur mesure, sur devis (DP §13.4).
- **Recruteurs :** formules Découverte à Élite ; l'accès aux mineurs exige toujours la vérification
  de l'organisation, quel que soit l'abonnement.
- **Académie :** pas d'export de recherche, quelle que soit la formule (`rbac.md`).
- 1 000 lignes par export est le plafond technique (`EXPORT_ROWS_CAP`) ; 20 recherches sauvegardées
  par compte est la limite actuelle de la base, indépendante de la formule.
- Le nombre de joueurs gérés et d'utilisateurs n'est pas encore appliqué par le code [À COMPLÉTER
  au lot 2.10].

## À trancher en fin de projet

- Montants définitifs (Fabrice Olinga) et éventuels tarifs de lancement.
- Taxes, mentions des factures et entité qui facture (Q20).
- Conditions de renouvellement, de résiliation et de remboursement (CGU §7).

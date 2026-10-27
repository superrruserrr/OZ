# ADR-006 : Abstraction des fournisseurs de paiement

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

Les clients d'OZ paient de deux façons qui ne se ressemblent pas : cartes bancaires (clubs et
recruteurs étrangers) et mobile money (MTN MoMo, Orange Money) au Cameroun en XAF. Le mobile money
n'offre pas de prélèvement récurrent fiable ; une entité camerounaise ne peut pas détenir de compte
Stripe ; l'entité qui encaisse n'est pas encore tranchée (Q20 de `requirements.md`). Les paiements
arrivent en Phase 2 (lot 2.10), mais les abonnements et quotas existent dès la Phase 1
(`subscriptions`, lot 1.14).

Sources : [technology_decisions.md TD-013](../../technology_decisions.md), plan §4.2, §8 lot 2.10,
`requirements.md` Q20, propriétés CP-32 et CP-33.

## Options envisagées

1. **Interface `PaymentProvider`, Stripe (cartes) + CinetPay (mobile money)** — CinetPay couvre MTN
   et Orange en XAF par une seule API ; Stripe couvre abonnements, portail client et factures pour
   l'étranger. Inconvénients : deux fournisseurs, deux réconciliations, commissions de CinetPay plus
   élevées que les API directes.
2. **Flutterwave seul** — panafricain, cartes et mobile money. Inconvénients : plus présent en Afrique
   anglophone, couverture et conditions CEMAC moins favorables.
3. **API directes MTN MoMo et Orange Money + Stripe** — commissions minimales. Inconvénients : deux
   intégrations et deux contrats opérateurs de plus, maintenance plus lourde.

## Décision

Tout paiement passe par l'interface `PaymentProvider` du domaine de facturation, avec deux
implémentations : Stripe pour les cartes, CinetPay pour le mobile money. Les abonnements payés par
mobile money sont des périodes prépayées (mois, trimestre, an) avec rappels avant échéance ; seuls
les abonnements par carte se renouvellent automatiquement. L'état d'abonnement est calculé côté
serveur à partir des seuls paiements confirmés par webhook signé et idempotent (CP-32, CP-33) ;
chaque opération est inscrite au journal d'audit.

## Conséquences

- Positives : le domaine ignore le fournisseur ; ajouter Flutterwave pour l'expansion anglophone
  revient à écrire une implémentation de plus ; aucun état d'abonnement dicté par le client.
- Négatives : deux réconciliations comptables ; couverture de tests à 100 % sur
  `apps/api/src/billing` (R6) ; dépendance à la réponse de Q20 pour ouvrir les comptes.
- Ce que cela ferme : un abonnement « actif » calculé à partir d'un retour de navigateur. Ce que cela
  ouvre : changement de fournisseur par pays sans toucher aux règles d'abonnement.
- Retour arrière : remplacer un fournisseur se fait derrière l'interface ; l'historique des
  paiements reste dans la base d'OZ.

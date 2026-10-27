# ADR-002 : Authentification propriétaire plutôt que fournisseur externe

Statut : Accepté
Date : 2026-10-27 · Décideurs : Gaëtan Wassu

## Contexte

L'identité vérifiée _est_ le produit d'OZ. La minorité doit être recalculée à chaque requête, jamais
mise en cache dans le jeton ([plan §6.7](../PLAN.md)) ; la rotation des jetons de rafraîchissement doit
détecter la réutilisation et révoquer toute la famille (§6.2) ; la 2FA est obligatoire pour les
administrateurs, les centres et les fédérations. Les données concernent des mineurs africains et
sont destinées, entre autres, à des clubs européens : leur localisation et leurs sous-traitants
comptent (§6.8). Le plan écarte tout Backend-as-a-Service sur le cœur de valeur (§4.4).

Sources : [technology_decisions.md TD-005](../../technology_decisions.md), plan §6.2, §6.7, §6.8,
exigences EX-103, EX-T18.

## Options envisagées

1. **Implémentation propriétaire (NestJS)** — Argon2id, JWT d'accès de 15 min en mémoire,
   rafraîchissement en cookie `httpOnly` + `Secure` + `SameSite=Strict` avec rotation et détection de
   réutilisation, sessions révocables, TOTP. Avantages : contrôle total, données hébergées avec le
   reste (Scaleway, Paris). Inconvénients : responsabilité de sécurité entière. Coût : temps de
   développement et de test (lot 1.3).
2. **Auth0, Clerk, Supabase Auth** — rapides à intégrer, 2FA et sessions fournies. Inconvénients :
   identités hors de l'hébergement de l'UE choisi, sous-traitant supplémentaire au registre RGPD,
   personnalisation limitée de la rotation et du calcul de minorité, coût par utilisateur actif.
3. **Keycloak ou Zitadel auto-hébergé** — robustes, standards (OIDC). Inconvénients : lourds à opérer
   et à mettre à jour pour une petite équipe, un service critique de plus à sauvegarder.

## Décision

Authentification propriétaire, conforme au §6.2 : Argon2id (m=19456, t=2, p=1), vérification
HaveIBeenPwned par k-anonymité, délai exponentiel sans verrouillage définitif, JWT 15 min, rotation
du rafraîchissement avec révocation de famille, sessions listées et révocables, TOTP obligatoire pour
les rôles sensibles. Mise en œuvre au lot 1.3.

## Conséquences

- Positives : règles métier (minorité, rôles, 2FA par rôle) au plus près de l'identité ; aucun
  sous-traitant d'authentification ; aucun coût par utilisateur.
- Négatives : toute faille est la nôtre → couverture de tests à 100 % sur `apps/api/src/auth` et
  `packages/auth` (R6, seuil bloquant en CI), revue adversariale systématique, tests de réponses
  indiscernables (CP-28).
- Ce que cela ferme : la connexion fédérée « clé en main ». Ce que cela ouvre : une connexion
  sociale ou OIDC pourra s'ajouter derrière la même gestion de sessions.
- Retour arrière : les comptes et hachages Argon2id sont exportables ; un fournisseur OIDC peut être
  placé devant l'API en gardant les rôles et la minorité côté OZ.

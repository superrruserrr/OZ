# Phase 0.5: Contrats partagés

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Conventions de `packages/contracts` (un dossier par ressource, `*.schema.ts`, export des types) | EX-005 n° 1, EX-T04 n° 2 |
| 2 | `ZodValidationPipe` NestJS : 422 avant toute logique, `strict()` | EX-005 n° 3, EX-T04 n° 3, CP-05, CP-06 |
| 3 | Premier schéma partagé (formulaire de contact) consommé par web et API | EX-005 n° 2, EX-106 (préparation) |
| 4 | Tests de contrat formulaire ↔ schéma | EX-005 n° 4, EX-T04 n° 4 |

## Dependencies

- [x] Lot 0.3 mergé dans `develop` (PR #3, `a0ba88d`) : `InputValidationException` → 422, format `ApiError`
- [ ] Branche `feat/p0-contracts-validation` créée depuis `develop` (porte la suppression de `phase0.3_plan.md`)

### Décisions à valider (prises au plan)

| # | Sujet | Choix proposé | Raison |
|---|---|---|---|
| D1 | Côté « web » alors que Next.js arrive au lot 0.4 | Le formulaire est un **composant React** de `apps/web` (`ContactForm`), testé dans jsdom avec Testing Library ; le lot 0.4 le monte dans une page Next.js, le lot 1.6 dans la page Contact | Livre le double contrôle C1/C2 réel (EX-005 n° 2) sans attendre 0.4 ; React 19 est la version exigée par Next.js 16 |
| D2 | Champ inconnu dans une requête | **Rejet en 422** (`z.strictObject`, code `unrecognized_keys`) plutôt que suppression silencieuse | Rend visibles les bugs client et les tentatives d'affectation en masse ; CP-06 (« un champ hors schéma n'atteint jamais le service ») tenu dans les deux cas. Le §7.1 dit « supprime », EX-T04 n° 3 dit « strict() » : le plan est ambigu, ce choix suit `strict()` |
| D3 | Endpoint de démonstration | `POST /contact` réel, **derrière le drapeau `FEATURE_CONTACT_FORM`** (R13), désactivé par défaut et en production (404) tant que la limitation de débit (lot 1.3) et l'envoi d'email (lot 1.15) n'existent pas ; activé : 202 `{ status: "received" }`, rien n'est stocké ni journalisé du contenu | Endpoint public sans anti-abus = vecteur de spam ; le drapeau permet de merger tôt sans exposer |

### Bibliothèques (à consigner dans `DEPENDENCIES.md`)

| Paquet | Version | Où | Rôle |
|---|---|---|---|
| `react`, `react-dom` | ^19.3.1 | `apps/web` | Composant formulaire (version requise par Next.js 16, lot 0.4) |
| `react-hook-form` | ^7.91.0 | `apps/web` | Formulaire performant (TD-003) |
| `@hookform/resolvers` | ^6.0.0 | `apps/web` | `zodResolver` (compatible Zod 4) |
| `zod` | ^4.6.7 | `packages/contracts` | Schémas partagés |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`, `jsdom`, `@types/react`, `@types/react-dom` | dernières stables | `apps/web` (dev) | Tests du composant dans jsdom |

---

## Tasks

### Task 1: Conventions de `packages/contracts`

**What:** Structurer le paquet des contrats pour qu'un schéma se trouve, s'importe et se teste toujours de la même façon.

**Files:**
- Create: `packages/contracts/README.md` — règles : un dossier par ressource (`src/<ressource>/`), un fichier `<action>.schema.ts` par schéma, export du schéma (`<action><Ressource>Schema`) et du type inféré (`<Action><Ressource>Input`) conformément à `naming_conventions.md` ; objets toujours stricts ; messages d'erreur en clés i18n, jamais en texte final ; aucun import de Nest, React ou Node dans ce paquet (exécuté dans le navigateur et le serveur)
- Create: `packages/contracts/src/common/fields.ts` — briques réutilisables : `email`, `personName` (2–100 caractères, lettres, espaces, apostrophes, traits d'union, accents), `message` (bornes), `consent` (`true` littéral obligatoire)
- Modify: `packages/contracts/src/index.ts` — export par ressource ; `packages/contracts/package.json` — dépendance `zod`, `exports` par sous-chemin (`@oz/contracts/contact`)
- Create: `scripts/contracts-conventions.test.mjs` — vérifie l'arborescence et les noms

**AC:**
- [ ] Un fichier hors convention (`src/contact/Contact.ts`, schéma non suffixé `Schema`, objet non strict) fait échouer `pnpm test` (EX-005 n° 1)
- [ ] `packages/contracts` ne dépend ni de `@nestjs/*`, ni de `react`, ni de modules `node:` (vérifié par le test)
- [ ] Les types inférés sont exportés et utilisables par `apps/api` et `apps/web`

---

### Task 2: `ZodValidationPipe`

**What:** Un pipe NestJS qui valide chaque entrée avec son schéma de contrat et rejette en 422 avant toute logique métier.

**Files:**
- Create: `apps/api/src/common/validation/zod-validation.pipe.ts` — `new ZodValidationPipe(schema)` : `safeParse` ; échec → `InputValidationException` (lot 0.3, 422 `VALIDATION_FAILED`, champs sans valeurs) ; succès → valeur **parsée** (types convertis, aucun champ hors schéma)
- Create: `apps/api/src/common/validation/validated-body.decorator.ts` — `@ValidatedBody(schema)` = `@Body(new ZodValidationPipe(schema))`
- Create: `apps/api/src/common/validation/zod-validation.pipe.test.ts`

**AC:**
- [ ] Une entrée non conforme renvoie 422 `VALIDATION_FAILED` et le gestionnaire du contrôleur **n'est jamais appelé** (CP-05, EX-T04 n° 3)
- [ ] Un champ inconnu renvoie 422 avec `details: [{ field, code: "unrecognized_keys" }]` (D2, CP-06)
- [ ] Le contrôleur reçoit l'objet parsé (ex. email normalisé), pas le corps brut
- [ ] Aucune valeur reçue n'apparaît dans la réponse 422 ni dans les logs

---

### Task 3: Schéma de contact partagé, endpoint et composant

**What:** Le premier contrat réel : un même schéma valide le formulaire de contact dans le navigateur (C1) et l'endpoint `POST /contact` (C2).

**Files:**
- Create: `packages/contracts/src/contact/send-contact-message.schema.ts` — `sendContactMessageSchema` : `name`, `email`, `organisationType` (énumération des 7 profils + `autre`), `message` (20–2 000 caractères), `consent` (vrai obligatoire, politique de confidentialité) ; type `SendContactMessageInput`
- Create: `apps/api/src/contact/contact.controller.ts`, `contact.module.ts` — `POST /contact` avec `@ValidatedBody(sendContactMessageSchema)` → 202 `{ status: "received" }` ; module monté seulement si `FEATURE_CONTACT_FORM=true` (sinon 404) ; aucun stockage, aucun log du contenu ; documenté en OpenAPI (corps, 202, 422 `ApiErrorDto`)
- Modify: `packages/config/src/api-config.ts` — `FEATURE_CONTACT_FORM` (booléen, défaut `false`, **refusé à `true` si `APP_ENV=production`** tant que les lots 1.3 et 1.15 ne sont pas livrés) ; `.env.example` (`FEATURE_CONTACT_FORM=false`)
- Create: `apps/web/src/contact/contact-form.tsx` — `ContactForm` : React Hook Form + `zodResolver(sendContactMessageSchema)` ; erreurs affichées par champ (clé i18n), `data-testid` conformes à `naming_conventions.md` (`contact-form-name`, …, `contact-form-submit`) ; envoi via une fonction `onSubmit(values)` injectée (le client HTTP arrive avec Next.js au lot 0.4)
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json` (JSX `react-jsx`, DOM), `apps/web/vitest.config.ts` (environnement jsdom)

**AC:**
- [ ] Le même import `sendContactMessageSchema` est utilisé par `apps/api` et `apps/web` (EX-005 n° 2)
- [ ] Navigateur (C1) : un email invalide affiche l'erreur sous le champ et `onSubmit` n'est pas appelé
- [ ] Serveur (C2) : le même email invalide envoyé directement à l'API renvoie 422, même si le client est contourné (EX-T04 n° 1)
- [ ] Données valides : `onSubmit` reçoit exactement les champs du schéma ; l'API répond 202
- [ ] `FEATURE_CONTACT_FORM=false` → `POST /contact` 404 ; `APP_ENV=production` + `FEATURE_CONTACT_FORM=true` → démarrage refusé
- [ ] Le contenu du message n'apparaît dans aucun log

---

### Task 4: Tests de contrat formulaire ↔ schéma

**What:** Empêcher qu'un champ existe d'un côté sans l'autre.

**Files:**
- Create: `apps/web/src/contact/contact-form.contract.test.tsx` — rend `ContactForm`, relève les champs du formulaire (`name` des contrôles) et les compare aux clés de `sendContactMessageSchema.shape`, dans les deux sens
- Create: `apps/web/src/test/form-contract.ts` — utilitaire réutilisable `expectFormMatchesSchema(form, schema)` pour tous les formulaires futurs

**AC:**
- [ ] Un champ ajouté au schéma sans le formulaire fait échouer le test (EX-T04 n° 4)
- [ ] Un champ ajouté au formulaire sans le schéma fait échouer le test
- [ ] L'utilitaire est documenté dans `packages/contracts/README.md` comme obligatoire pour tout formulaire

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Conventions et indépendance du paquet | `scripts/contracts-conventions.test.mjs` | Task 1 |
| Schéma de contact : valeurs valides, limites, champ inconnu | `packages/contracts/src/contact/send-contact-message.schema.test.ts` | Tasks 1, 3 |
| Pipe : 422 avant le gestionnaire, objet parsé transmis, champ inconnu | `apps/api/src/common/validation/zod-validation.pipe.test.ts` | Task 2 |
| `POST /contact` : 202, 422, 404 selon le drapeau, aucun contenu dans les logs | `apps/api/test/contact.int.test.ts` | Tasks 2, 3 |
| Configuration : drapeau refusé en production | `packages/config/src/api-config.test.ts` | Task 3 |
| Formulaire : erreurs C1, envoi des seuls champs du schéma | `apps/web/src/contact/contact-form.test.tsx` | Task 3 |
| Contrat formulaire ↔ schéma | `apps/web/src/contact/contact-form.contract.test.tsx` | Task 4 |

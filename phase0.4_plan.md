# Phase 0.4 : Squelette web Next.js (chaîne B)

**Branche :** `feat/p0-web-nextjs-skeleton` (depuis `develop` à jour, `7118e68`). PR ≤ 800 lignes hors lockfile (R1).
**Goal :** une application web sombre, internationalisée, déployable ; page d'accueil aux jetons OZ prête pour la recette (0.8).

## Décisions à valider (D1-D4)

| # | Décision | Proposition | Alternative |
|---|---|---|---|
| D1 | Version de Next.js | **16.4.3** (dernière stable ; « Next.js 15 » d'EX-004 est un plancher, TD note de versions). Conséquence : `proxy.ts` remplace `middleware.ts`, Turbopack par défaut | 15.x : branche en fin de support |
| D2 | i18n | **next-intl 4.14.9**, préfixe `as-needed` : `/` = français, `/en` = anglais. Admin : next-intl sans routage, français seul, anglais préparé | Dictionnaires maison : plus léger, mais pluriels/format ICU à réécrire |
| D3 | Polices | **Fontsource variable** (Inter, Inter Tight, JetBrains Mono, OFL-1.1), seuls les fichiers `latin` + `latin-ext` woff2 chargés par `next/font/local` (auto-hébergées, préchargées, aucun appel Google) | Sous-ensemble sur mesure (`subset-font`) : plus petit, outillage en plus ; à reconsidérer au lot 1.5 si le budget 3G l'exige |
| D4 | Vérification navigateur | **Playwright 1.64.1 + @axe-core/playwright 4.14.0** dès ce lot : test de fumée (FR/EN, CSP, 320 px, axe AA). Téléchargement de Chromium (~150 Mo) en local | Différer à 0.7 (CI) : la CSP et l'accessibilité ne seraient vérifiées qu'en tests unitaires |

Hors lot : shadcn/ui et composants (0.10), Dockerfile et déploiement (0.8), Archivo/logo (designer), reCAPTCHA dans la CSP (lot auth).

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | Jetons OZ dans `packages/ui` (CSS + thème Tailwind 4 + export typé) | EX-004.1, design §8.3, EX-T22.1 |
| 2 | `apps/web` en Next.js App Router + Tailwind | EX-004.1, TD-003, TD-008 |
| 3 | Polices auto-hébergées sous-ensemblées | design §8.5, EX-T22.3, R12 |
| 4 | i18n français par défaut, anglais préparé | EX-004.2, EX-T21.3 |
| 5 | CSP avec nonce et en-têtes de sécurité | EX-T17.2, plan §6.5 |
| 6 | Layout de base et page d'accueil provisoire | EX-004.3, EX-T22.1-2, design §8.2/8.7/8.10 |
| 7 | `apps/admin` squelette | EX-004.1, EX-T21.3 |
| 8 | Fumée navigateur, registre R12, outillage | EX-T22, R12, R1 |

## Dependencies

- [ ] `develop` contient le lot 0.5 et le correctif #10 (vérifié : `7118e68`)
- [ ] D1-D4 validées par Gaëtan Wassu
- [ ] Node ≥ 20.9 (Next 16) : Node 22 local OK
- [ ] Aucun service Docker requis (la page d'accueil n'appelle pas l'API)

---

## Tasks

### Task 1: Jetons OZ dans packages/ui

**What:** poser les jetons de `design.md` §8.3 en variables CSS, les exposer au thème Tailwind 4 (`@theme`) et en objet TypeScript typé.

**Files:**
- Create: `packages/ui/src/tokens.ts` — objet `ozColors` (gelé, `as const`), source unique des valeurs
- Create: `packages/ui/styles/tokens.css` — `:root { --oz-* }` + `@theme inline` (`--color-oz-bg: var(--oz-bg)`…), polices `--font-sans/--font-display/--font-mono` branchées sur les variables de `next/font`
- Create: `packages/ui/styles/base.css` — `color-scheme: dark`, fond `bg`, texte `text`, focus visible vert, `prefers-reduced-motion` global
- Modify: `packages/ui/package.json` — exports `./tokens`, `./styles/*.css` ; `packages/ui/src/index.ts`

**AC:**
- [ ] Les 27 jetons de §8.3 sont présents, valeurs identiques au CSS de `design.md` (test qui compare `tokens.ts` et `tokens.css`)
- [ ] Contraste calculé (formule WCAG) ≥ 4,5 sur `bg` pour `text`, `text-muted`, `text-label`, `primary`, `legal-text`, `kyc`, `danger`, et `on-primary` sur `primary-from`/`primary-to` ; `text-disabled` explicitement exempté (inactif)
- [ ] `legal` (`#3B64F1`) n'est jamais exposé comme couleur de texte Tailwind (`text-oz-legal` absent ; `text-oz-legal-text` présent) — M8
- [ ] Aucune dépendance runtime ajoutée à `packages/ui`

---

### Task 2: apps/web en Next.js App Router + Tailwind

**What:** transformer `apps/web` (aujourd'hui bibliothèque `tsc`) en application Next.js 16 avec Tailwind 4, en conservant `src/contact` et ses tests.

**Files:**
- Create: `apps/web/next.config.ts` — `output: 'standalone'`, `poweredByHeader: false`, `reactStrictMode`, `transpilePackages: ['@oz/ui', '@oz/contracts']`, plugin next-intl
- Create: `apps/web/postcss.config.mjs` (`@tailwindcss/postcss`), `apps/web/src/app/globals.css` (`@import "tailwindcss"` + jetons + base de `@oz/ui`)
- Modify: `apps/web/package.json` — scripts `dev` (port 3000), `build` (`next build`), `start`, `typecheck` ; `NEXT_TELEMETRY_DISABLED=1` ; deps `next`, `next-intl`, `tailwindcss`, `@tailwindcss/postcss`
- Modify: `apps/web/tsconfig.json` / `tsconfig.build.json` — plugin `next`, `src/**`, `.next/types` ; supprimer `src/index.ts` et son test
- Modify: `turbo.json` — outputs `.next/**`, `!.next/cache/**` ; tâche `dev` (`cache: false`, `persistent: true`) ; `package.json` racine : script `dev:web`
- Modify: `eslint.config.mjs` — `@next/eslint-plugin-next` (recommended + core-web-vitals) sur `apps/web`, `apps/admin` ; ignores `.next/**`, `next-env.d.ts`

**AC:**
- [ ] `pnpm build` produit `apps/web/.next/standalone` ; `pnpm --filter @oz/web start` sert la page d'accueil
- [ ] `pnpm typecheck`, `pnpm lint`, tests existants du formulaire de contact (lot 0.5) toujours verts
- [ ] Aucun en-tête `X-Powered-By` ; télémétrie Next désactivée dans tous les scripts
- [ ] Aucune requête vers un domaine tiers au chargement de `/` (polices, scripts, images)

---

### Task 3: Polices auto-hébergées sous-ensemblées

**What:** charger Inter, Inter Tight et JetBrains Mono depuis les paquets Fontsource variables, sous-ensembles `latin` + `latin-ext` uniquement, via `next/font/local`.

**Files:**
- Create: `apps/web/src/app/fonts.ts` — trois `localFont` (`display: 'swap'`, `variable: '--oz-font-*'`, `preload` sur Inter seulement)
- Modify: `apps/web/package.json` — `@fontsource-variable/inter`, `@fontsource-variable/inter-tight`, `@fontsource-variable/jetbrains-mono`

**AC:**
- [ ] Seuls des fichiers woff2 `latin`/`latin-ext` sont émis dans `.next/static/media` (test sur la sortie de build : aucun `cyrillic`, `greek`, `vietnamese`)
- [ ] Poids total des polices servies ≤ 200 Ko (mesuré sur la sortie de build) — budget 3G EX-T22.3
- [ ] Licence OFL-1.1 consignée dans `DEPENDENCIES.md`

---

### Task 4: i18n français par défaut, anglais préparé

**What:** next-intl avec routage `[locale]`, préfixe `as-needed`, messages `fr` et `en` ; aucune chaîne d'interface en dur.

**Files:**
- Create: `apps/web/src/i18n/routing.ts` (`locales: ['fr', 'en']`, `defaultLocale: 'fr'`, `localePrefix: 'as-needed'`), `apps/web/src/i18n/request.ts`, `apps/web/src/i18n/navigation.ts`
- Create: `apps/web/messages/fr.json`, `apps/web/messages/en.json`
- Create: `apps/web/src/app/[locale]/layout.tsx` (`<html lang>` dynamique, `generateStaticParams` absent car CSP dynamique), `apps/web/src/app/[locale]/not-found.tsx`
- Modify: `eslint.config.mjs` — `no-restricted-syntax` `JSXText[value=/\S/]` sur `apps/{web,admin}/src/app/**` (chaîne en dur interdite, EX-T21.3)

**AC:**
- [ ] `/` répond en français (`<html lang="fr">`) ; `/en` en anglais ; `/fr` redirige vers `/` ; locale inconnue → 404
- [ ] `fr.json` et `en.json` ont exactement les mêmes clés (test de parité) ; aucune valeur vide
- [ ] Une chaîne en dur dans un composant de `src/app` fait échouer `pnpm lint` (test de la règle)
- [ ] La négociation `Accept-Language` ne redirige pas un visiteur francophone hors de `/`

---

### Task 5: CSP avec nonce et en-têtes de sécurité

**What:** `proxy.ts` génère un nonce par requête et pose la CSP du §6.5 et les en-têtes de sécurité ; le nonce est transmis aux scripts Next.

**Files:**
- Create: `packages/config/src/security-headers.ts` — fonction pure `buildSecurityHeaders({ nonce, isProduction })`, partagée par web et admin (testable seule)
- Create: `apps/web/src/proxy.ts` — nonce `crypto.randomUUID()` → base64, chaîné avec le proxy next-intl ; en-tête `x-nonce` de requête
- Modify: `apps/web/src/app/[locale]/layout.tsx` — lecture du nonce via `headers()`

**AC:**
- [ ] CSP : `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; style-src 'self' 'nonce-…'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` ; jamais `'unsafe-inline'` ni `'unsafe-eval'` en production (en dev, `'unsafe-eval'` toléré pour le rechargement à chaud uniquement)
- [ ] Nonce différent à chaque requête, ≥ 128 bits, présent sur chaque `<script>` de la page
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, `X-Frame-Options: DENY` ; HSTS (`max-age=63072000; includeSubDomains; preload`) seulement si production
- [ ] Les fichiers statiques (`/_next/static`, polices) ne passent pas par le proxy (matcher)

---

### Task 6: Layout de base et page d'accueil provisoire

**What:** layout sombre (registre Pilotage par défaut) et page d'accueil provisoire en registre Émotion sobre, mobile-first 320 px.

**Files:**
- Create: `apps/web/src/app/[locale]/page.tsx` — logo texte « OZ », titre Inter Tight avec accent `lime` (E17, repli sans glow), accroche « Ton talent, notre mission », trois piliers (identité vérifiée, protection des mineurs, mise en relation), sélecteur de langue FR/EN, mention « Bientôt disponible »
- Create: `apps/web/src/components/locale-switcher.tsx`
- Modify: `apps/web/messages/*.json` — textes de la page

**AC:**
- [ ] Aucun chiffre fictif (M5), aucun logo de tiers (M4), aucun lien vers une route inexistante ; français par défaut (M7)
- [ ] Utilisable à 320 px sans défilement horizontal (EX-T22.2) ; cibles tactiles ≥ 44 px
- [ ] Animations limitées à `transform`/`opacity`, coupées sous `prefers-reduced-motion` (design §8.7)
- [ ] Hiérarchie de titres valide (un seul `h1`), `lang` correct, lien d'évitement vers le contenu
- [ ] Aucun JavaScript client hors sélecteur de langue (composant serveur par défaut)

---

### Task 7: apps/admin squelette

**What:** `apps/admin` en Next.js minimal partageant jetons et polices, non indexable, français seul via next-intl sans routage.

**Files:**
- Create: `apps/admin/next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/i18n/request.ts`, `messages/fr.json`, `messages/en.json`, `src/proxy.ts` (appelle `buildSecurityHeaders` de `@oz/config`, aucune copie)
- Modify: `apps/admin/package.json` (port 3002), `tsconfig*.json` ; supprimer `src/index.ts` et son test

**AC:**
- [ ] `/` affiche « OZ · Administration » aux jetons OZ, repère `admin` (#D29847)
- [ ] `X-Robots-Tag: noindex, nofollow` et `<meta name="robots" content="noindex">` ; mêmes CSP et en-têtes que le web (une seule implémentation partagée)
- [ ] Aucune chaîne en dur (même règle ESLint) ; parité des clés fr/en

---

### Task 8: Fumée navigateur, registre R12, outillage

**What:** test de fumée Playwright + axe sur les deux apps, mise à jour des registres et du lanceur local.

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/web-smoke.spec.ts`, `e2e/admin-smoke.spec.ts` (serveurs lancés par `webServer`, build de production)
- Modify: `package.json` racine — script `test:e2e` (hors `pnpm test` : navigateur requis) ; `vitest.config.ts` exclut `e2e/`
- Modify: `DEPENDENCIES.md` — section « lot 0.4 web/admin/ui » (next, next-intl, tailwindcss, @tailwindcss/postcss, polices, @next/eslint-plugin-next, @playwright/test, @axe-core/playwright) ; `allowBuilds` si un paquet l'exige (sharp : refus par défaut, aucune optimisation d'image dans ce lot)
- Modify: `.claude/launch.json` — configurations `web` (3000) et `admin` (3002) à côté de `api`
- Modify: `DEBT.md` si un écart est accepté ; `CHANGELOG.md`

**AC:**
- [ ] Fumée : `/` et `/en` répondent 200 avec le bon `lang` ; en-têtes CSP/sécurité présents ; nonce identique entre en-tête et scripts ; 0 erreur console
- [ ] axe-core : 0 violation WCAG 2.1 A/AA sur `/`, `/en` et l'accueil admin
- [ ] À 320 px : `scrollWidth ≤ clientWidth`
- [ ] `pnpm lint` (contrôle R12) passe : toutes les nouvelles dépendances consignées
- [ ] Pipeline complet vert : build, typecheck, lint, test, gitleaks ; diff ≤ 800 lignes hors lockfile et JSON de messages

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Jetons CSS = jetons TS = design §8.3 | `packages/ui/src/tokens.test.ts` | Valeurs, absence de `text-oz-legal` |
| Contrastes WCAG des jetons | `packages/ui/src/contrast.test.ts` | ≥ 4,5 (exemption `text-disabled`) |
| Construction des en-têtes | `packages/config/src/security-headers.test.ts` | CSP §6.5, nonce, HSTS prod seulement, pas d'`unsafe-inline` |
| Proxy nonce | `apps/web/src/proxy.test.ts` | Nonce unique par requête, en-têtes posés, matcher exclut les statiques |
| Parité des messages | `apps/web/src/i18n/messages.test.ts`, `apps/admin/src/i18n/messages.test.ts` | Mêmes clés fr/en, aucune valeur vide |
| Règle « pas de chaîne en dur » | `scripts/eslint-i18n.test.mjs` | `JSXText` non vide refusé dans `src/app` |
| Page d'accueil (rendu) | `apps/web/src/app/[locale]/page.test.tsx` | Un `h1`, accroche, pas de chiffre, sélecteur de langue |
| Polices émises | `scripts/web-build-output.test.mjs` | Seuls latin/latin-ext, poids ≤ 200 Ko (après build) |
| Fumée web | `e2e/web-smoke.spec.ts` | FR/EN, en-têtes, nonce, axe AA, 320 px, 0 erreur console |
| Fumée admin | `e2e/admin-smoke.spec.ts` | noindex, en-têtes, axe AA |
| Formulaire de contact (lot 0.5) | `apps/web/src/contact/*.test.tsx` | Non-régression |

# Naming Conventions

Claude: Read this before generating UI components, API routes, database changes, or tests. `/commit-phase` checks compliance.

## UI Foundations

Accessibility: WCAG 2.1 AA (axe-core + Lighthouse ≥ 90), 320 px minimum, 3G budget
Reference: `EX CHART/` mockups — tokens, components, effects in `design.md` §8
Component library: shadcn/ui on Radix, owned code in `packages/ui`
Color scheme: dark only (tokens `--oz-*`, `design.md` §8.3). Never hard-code a hex value in an app: use tokens.
Language: UI copy in French by default, through i18n keys only. Code identifiers in English.

## REQUIRED: Test IDs

```tsx
// Pattern: {screen}-{element}[-{qualifier}]  — kebab-case, English
data-testid="onboarding-identity-submit"
data-testid="onboarding-identity-birth-date"
data-testid="auth-otp-digit-3"
data-testid="role-card-player"              // one per account type
data-testid="search-result-row-OZ-CM-26-7K4M9Q-M"  // dynamic: use the OZ ID, never an index or a UUID
data-testid="kyc-review-approve"
data-testid="kyc-review-reject"
data-testid="badge-verified"                // status badges: badge-{status}
data-testid="modal-guardian-invite"          // modals: modal-{name}
data-testid="modal-guardian-invite-submit"

// NOT
data-testid="submitBtn"            // camelCase
data-testid="btn1"                 // meaningless
data-testid="row-3"                // index-based
data-testid="valider-identite"     // French
```

Every interactive element (button, link, input, select, checkbox, tab, card that is clickable) MUST have a `data-testid`.

## REQUIRED: Modal Props

```ts
interface ModalProps {
  open: boolean;                           // NOT isOpen, visible, show
  onClose: () => void;                     // NOT onCancel, handleClose, onDismiss
  onSubmit?: (values: T) => Promise<void>; // NOT onConfirm, onSave, handleSubmit
  title: string;                           // i18n-resolved string
}
// Radix Dialog wiring: <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
```

## REQUIRED: Error State

```ts
// Form / component state
const [error, setError] = useState<string | null>(null);                 // form-level message, i18n-resolved
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}); // keyed by schema field name
// NOT: err, errors, errorMessage, errorMsg, formError, validationErrors

// API error body — single normalized format (EX-003, EX-T07)
type ApiError = {
  code: string;          // SCREAMING_SNAKE, stable: "KYC_DOCUMENT_EXPIRED", "AUTH_INVALID_CREDENTIALS"
  message: string;       // generic for security errors (never reveals account existence)
  requestId: string;
  details?: { field: string; code: string }[];  // validation only (422)
};
// NOT: { error: "..." }, { msg }, { errors: [...] }, HTTP 200 with an error inside
```

Security errors (auth, authorization) MUST use a generic `message`; 403 never returns partial data.

## Naming Patterns

| Element | Convention | Example | NOT |
|---|---|---|---|
| Files (all TS/TSX) | kebab-case | `player-card.tsx`, `register.schema.ts`, `kyc-routing.service.ts` | `PlayerCard.tsx`, `kycRouting.ts` |
| React components | PascalCase export | `export function PlayerCard()` | `playerCard` |
| Hooks | `use` + camelCase | `useOzIdCard`, `useKycStatus` | `getKycStatus` (hook) |
| NestJS modules | singular, folder per bounded context (§3.4) | `modules/player/player.controller.ts` | `modules/players/` |
| Zod schemas | camelCase + `Schema` | `registerPlayerSchema` | `RegisterPlayerSchema`, `playerValidator` |
| Inferred types | PascalCase + `Input` / `Output` / `Dto` | `RegisterPlayerInput`, `PlayerPublicDto` | `IRegisterPlayer` |
| Role views (serialization) | `{Entity}{Role}View` | `PlayerRecruiterView`, `PlayerGuardianView` | `PlayerDtoLimited` |
| API paths | English, kebab-case, plural resources | `POST /auth/login`, `GET /players/:ozId`, `POST /kyc/cases/:id/decisions` | `/getPlayer`, `/joueurs` |
| Web routes (URL segments) | French, kebab-case (mockups §8.8) | `/onboarding/tuteur`, `/academie/import` | `/onboarding/guardian` |
| DB tables / columns | snake_case, plural tables | `kyc_cases.created_at` | `KycCase.createdAt` |
| Prisma models / fields | PascalCase singular / camelCase, `@@map` / `@map` to snake_case | `model KycCase { createdAt @map("created_at") }` | unmapped names |
| Enum values | snake_case lowercase strings (DB and TS) | `'in_review'`, `'av_pending'` | `'IN_REVIEW'`, `InReview` |
| Timestamps (instant, UTC) | `*At` | `createdAt`, `verifiedAt`, `consentGivenAt` | `createdDate`, `verified_time` |
| Calendar dates (no time) | `*Date` | `birthDate`, `documentExpiryDate` | `birthAt`, `dob` |
| Booleans | `is*` / `has*` / `can*` | `isMinor`, `hasVerifiedGuardian` | `minor`, `guardianOk` |
| Money | integer minor units + ISO 4217 | `amountMinor: 5000, currency: 'XAF'` (XAF has 0 decimals) | `price: 50.00` |
| OZ ID | branded type `OzId`, field `ozId` | `ozId: OzId` | `oz_id` in TS, `ozID`, `playerCode` |
| Env vars | SCREAMING_SNAKE | `KYC_AUTO_REJECT_THRESHOLD` | `kycThreshold` |
| Feature flags | `{domain}.{camelCase}` | `kyc.autoApproveAdults` | `KYC_AUTO_APPROVE`, `auto-approve` |
| Audit actions | `{domain}.{entity}.{pastVerb}` snake | `kyc.case.approved`, `player.minor_profile.viewed` | `approveKyc`, `KYC_APPROVED` |
| BullMQ queues / jobs | kebab-case queue, `{verb}-{object}` job | queue `kyc`, job `scan-document` | `KycQueue`, `doScan` |
| i18n keys | dot.camelCase by screen | `onboarding.identity.title`, `kyc.status.verified` | `"Votre identité"` hard-coded |
| Design tokens | `--oz-{name}` / Tailwind `oz-{name}` | `bg-oz-surface-2`, `text-oz-legal-text` | `bg-[#10120F]` |
| Interfaces to providers | `{Capability}Provider` / `{Capability}Verifier` | `SmsProvider`, `PaymentProvider`, `EmailProvider`, `IdentityVerifier` | `TwilioService` used directly |
| Branches | §2.3 of the plan | `feat/p1-auth-refresh-token-rotation` | `phase-1.3-implementation` |
| Commits | Conventional Commits (description may be French) | `feat(kyc): rejet automatique sur document expiré` | `update stuff` |

## Toolset-Enforced (No Action Needed)

| Tool | Enforces |
|---|---|
| Prisma | DB snake_case via `@map`, migrations versioned |
| Zod | API field names = schema field names (camelCase), unknown fields stripped (`strict()`) |
| ESLint + Prettier | Formatting, import order, no `any` without justification, no `console.log` |
| commitlint | Conventional Commits |
| TypeScript strict | No implicit `any`, strict null checks |
| Vitest | Unit tests `*.test.ts(x)` next to the code |
| Testcontainers | Integration tests `*.int.test.ts` under `apps/api/test/` |
| Playwright | E2E specs `e2e/*.spec.ts`, selectors **only** via `getByTestId` or accessible role |
| gitleaks | No secrets committed |

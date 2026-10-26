# @oz/contracts

Schémas Zod partagés entre l'interface (`apps/web`, puis l'application mobile) et l'API (`apps/api`).
Un seul schéma, deux exécutions : le navigateur valide pour guider (C1), le serveur valide pour
décider (C2). Le serveur ne fait jamais confiance au client (§7.1, règle R4).

## Règles (vérifiées par `scripts/contracts-conventions.test.mjs`)

| Règle                                                                                                           | Exemple                                                    |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Un dossier par ressource, en kebab-case                                                                         | `src/contact/`, `src/player/`                              |
| Un fichier par schéma : `<action>.schema.ts`                                                                    | `send-contact-message.schema.ts`                           |
| Schéma exporté suffixé `Schema` ; seule autre exportation admise : une liste de valeurs constante en MAJUSCULES | `sendContactMessageSchema`, `ORGANISATION_TYPES`           |
| Type inféré exporté suffixé `Input` (ou `Output`)                                                               | `SendContactMessageInput`                                  |
| Objets toujours stricts : `z.strictObject` ; jamais `z.object`, `.loose()`, `.passthrough()`                    | un champ inconnu est refusé (422)                          |
| Messages d'erreur = clés i18n, jamais de texte final                                                            | `validation.email.invalid`                                 |
| Aucun import de `@nestjs/*`, `react`, `react-dom` ni `node:*`                                                   | le paquet tourne dans le navigateur et le serveur          |
| Briques communes dans `src/common/`                                                                             | `email`, `personName`, `longText`, `consent`               |
| Tout schéma est exporté par `src/index.ts`                                                                      | `import { sendContactMessageSchema } from '@oz/contracts'` |

## Règles des validations personnalisées (`.refine()`)

- Le message est une **clé i18n**, jamais un texte contenant la valeur reçue.
- Une règle ne lève jamais d'exception : elle renvoie `true` ou `false`. Une exception levée dans une règle
  devient une erreur 500 journalisée (le message d'exception irait dans les logs).
- Les règles asynchrones sont prises en charge par `ZodValidationPipe` (`safeParseAsync`).

## Rigueur et imports (vérifiés automatiquement)

- `src/strictness.test.ts` parcourt chaque schéma exporté : tout objet non strict, tout type ouvert
  (`z.record`, `z.unknown`, `z.any`, `z.custom`, `z.json`) ou schéma non reconnu fait échouer les tests.
- ESLint n'autorise que `zod` (pas `zod/mini`, `zod/v3`…), et interdit modules Node, `bun:*`, frameworks,
  `require()`, `import()` dynamique et `process`.

## Côté API

```ts
@Post()
send(@ValidatedBody(sendContactMessageSchema) input: SendContactMessageInput) { … }
```

Entrée non conforme → 422 `VALIDATION_FAILED` avant toute logique métier ; le contrôleur reçoit
l'objet **parsé** (normalisé), jamais le corps brut.

## Côté formulaire

```ts
useForm<SendContactMessageInput>({ resolver: zodResolver(sendContactMessageSchema) });
```

**Obligatoire :** chaque formulaire a un test de contrat
`expectFormMatchesSchema(formulaire, schéma)` (`apps/web/src/test/form-contract.ts`) qui échoue si un
champ existe d'un côté sans l'autre (EX-T04 n° 4).

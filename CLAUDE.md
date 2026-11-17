# Projet OZ

Document maître : `docs/PLAN.md` (référence OZ-PETF-2026-001). Il fait foi sur tout arbitrage technique, l'ordre des phases et la stratégie Git.

Références produit :
- `OZ_Document_de_Projet.pdf` — le pourquoi, pour qui, quoi (personas, Annexe B des droits, univers visuels §12.2, paliers).
- `EX CHART/` — maquettes de référence (palette, composants, effets, routes). Direction extraite dans `design.md` §8.
- `requirements.md` et `design.md` — sortie de `/kickoff` ; questions ouvertes en §6 de `requirements.md`.
- `technology_decisions.md` (TD-001 à TD-017), `implementation_plan.md`, `naming_conventions.md` — sortie de `/tech-stack`.
- Numérotation : une phase d'implémentation = un lot du plan (`/plan-phase 0.1`, `/plan-phase 1.3`…). Workflow Git adapté : `implementation_plan.md` §1.2.

## Orchestration obligatoire — App-Building Skills

Tout le travail sur ce projet est orchestré avec les skills installés dans `.claude/skills/`
(source : https://github.com/takleb3rry/claude-global-appbuilding-skills, commit e234f4e).
Toujours passer par le skill adapté plutôt que d'improviser un workflow.

Workflow pour OZ (le plan technique existe déjà, l'idéation est donc couverte) :

1. `/kickoff docs/PLAN.md` → `requirements.md` + `design.md`
2. `/tech-stack` → valider la stack définie en §4 du plan (ne pas la réinventer)
3. Pour chaque phase/lot du §8, dans l'ordre de merge du §9 :
   `/plan-phase N` → `/execute-phase N` → `/commit-phase N`
4. Qualité avant mise en recette/production : `/harmonize`, `/comprehensive-test`, `/ai-governance`
5. À tout moment : `/diagnose` pour un bug, `/verify` avant d'annoncer « fait ».

## Règles de priorité

- En cas de conflit entre un skill et le plan technique (branches, merge, environnements, sécurité, KYC), **le plan technique l'emporte**.
- `/commit-phase` fait des `git push` et des merges : toujours demander confirmation à l'utilisateur avant de pousser ou de merger.
- Ordre forcé : une couche N+1 ne démarre pas tant que la couche N n'est pas mergée, testée, documentée et déployée en recette (§0.2).

## Économie de crédits

Chaque message relit tout l'historique de la session : une session longue coûte cher, même pour une
commande simple. Règles pour ce projet :

- **Une session par lot.** À la fin d'un lot (PR fusionnée), proposer de continuer dans une nouvelle
  session. L'état vit dans les fichiers (`docs/AVANCEMENT.md`, `implementation_plan.md`,
  `phase<lot>_plan.md`, `RAPPORT-NUIT.md`), pas dans la conversation.
- **Sorties courtes.** Ne jamais afficher un journal ou un fichier entier : filtrer (`grep`, `tail`,
  `sed -n`), ne lire que les lignes utiles. Regrouper lint, typage et tests dans une seule commande
  et n'en garder que le résumé.
- **Captures d'écran au minimum.** Vérifier le texte et la structure (`read_page`, tests) ; une
  capture seulement pour une preuve visuelle, à échelle réduite.
- **Pas de sous-agent sans demande.** Une recherche ou une fouille se fait dans la session, sauf si
  l'utilisateur demande explicitement de déléguer.
- **Tests ciblés d'abord.** Lancer les tests des fichiers touchés ; la suite complète une seule fois,
  avant le commit. Un test instable sous charge se relance seul.
- **Réponses brèves.** Pas de récapitulatif de ce qui est déjà dans un fichier ou une PR : donner le
  lien.
- **Modèle.** Les tâches mécaniques (fusion, relance de CI, petite correction, documentation) ne
  demandent pas le modèle le plus puissant : le signaler à l'utilisateur quand une session ne fait
  plus que cela.

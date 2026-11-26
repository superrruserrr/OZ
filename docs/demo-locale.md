# Démonstration locale — tutoriel de test

Pile isolée pour essayer le site avec des données fictives. **Elle ne touche pas la base de
développement** : elle utilise son propre Postgres (conteneur `oz-demo-postgres`, port 5544). Poste
local seulement ; rien de ce qui est généré n'est versionné (dossier `.demo/`).

## 1. Installer (une fois)

Prérequis : Docker démarré et `pnpm dev:up` lancé (Redis et Mailpit du poste).

```bash
node scripts/demo-setup.mjs
```

Le script crée le Postgres de démonstration, applique les migrations, charge 500 joueurs
synthétiques et 30 organisations, puis crée le compte de test. Le relancer ne recrée rien.

## 2. Lancer

Dans deux terminaux :

```bash
node --env-file=.demo/demo.env apps/api/dist/main.js
```

```bash
node scripts/demo-web.mjs
```

Puis ouvrir <http://localhost:3010>. Dans Claude Code, les configurations `api-demo` et `web-demo`
de `.claude/launch.json` font la même chose.

## 3. Compte de test

- Identifiant : `root@oz.localhost` (la connexion se fait par email).
- Mot de passe : valeur de `DEMO_ROOT_PASSWORD` dans `.demo/demo.env`.

```bash
grep DEMO_ROOT_PASSWORD .demo/demo.env
```

Le mot de passe « 0000 » demandé n'est pas possible : la politique de sécurité exige 12 caractères
au moins et n'est pas affaiblie pour la démonstration. Le compte a le rôle « club » d'une organisation
vérifiée : il voit les joueurs majeurs à l'identité vérifiée (un majeur fictif sur deux dans cette
base).

### Joueurs fictifs (lot 1.19cg)

| Compte                | Joueur        | Fiche                          | Mot de passe (`.demo/demo.env`) |
| --------------------- | ------------- | ------------------------------ | ------------------------------- |
| `abena@oz.localhost`  | Abena Paul    | déclarée, modifiable, 4 photos | `DEMO_ABENA_PASSWORD`           |
| `samuel@oz.localhost` | Samuel Ndongo | vérifiée, 1 photo              | `DEMO_SAMUEL_PASSWORD`          |

Noms fictifs, photos libres sans visage (`docs/legal/credits.md`). Connecté en Abena : « Mon profil »
montre la photo de profil et la galerie ; « Modifier le profil » corrige la fiche ; la recherche de
l'en-tête trouve Samuel Ndongo (le joueur ne voit que les fiches vérifiées, sans export). Les photos
sont servies par le stockage S3 local (service `s3` de `infra/docker/compose.dev.yml`, port 8333),
démarré par `demo-setup` ; injoignable, les fiches restent sans photo et le script le signale.

## 4. Parcours à tester

Cocher au fur et à mesure.

### Accueil (sans compte)

- [ ] `http://localhost:3010` : héros « Ton talent, notre mission. », panneau « en direct ».
- [ ] Défiler : mission, aperçu d'une fiche d'exemple, trois étapes, engagements, profils, questions.
- [ ] Ouvrir une question fréquente au clic, puis au clavier (Tab, Entrée).
- [ ] Réduire la fenêtre sous 640 px : le menu ☰ ouvre une feuille plein écran, Échap la ferme.
- [ ] « Créer mon compte » mène au choix du rôle.

### Connexion et annuaire

- [ ] « Se connecter », saisir l'identifiant et le mot de passe du compte de test.
- [ ] Aller sur `http://localhost:3010/recherche` : 20 joueurs, chacun avec drapeau, sport et badge.
- [ ] Filtrer par poste (« Attaquant »), puis par pays ; « Effacer les filtres » revient à tout.
- [ ] Chercher un nom (deux lettres au moins) ; un nom introuvable affiche l'état vide.
- [ ] « Page suivante » avance, « Revenir au début » ramène à la première page.

### Fiche joueur

- [ ] Cliquer sur un joueur : nom, OZ ID, sport, poste, pays et niveau de vérification en tête.
- [ ] Cliquer sur « Profil sportif » : le volet s'ouvre avec le terrain et le poste.
- [ ] Fermer avec Échap : le focus revient sur la carte. Rouvrir, fermer avec la croix, puis en
      cliquant à côté.
- [ ] Ouvrir « Identité », « Mesures », « Vérification » et « Carte OZ ID ».
- [ ] Naviguer au clavier seul : Tab jusqu'à une section, Entrée, Échap.
- [ ] Saisir une adresse de fiche inexistante (`/joueur/OZ-XX-26-AAAAAA-A`) : page introuvable.

### Chargement et déconnexion

- [ ] Pendant un chargement de page de l'espace connecté, un ballon rebondit sur la ligne.
- [ ] « Se déconnecter », puis rouvrir `/recherche` : retour à la connexion.

## 5. Arrêter et nettoyer

Arrêter les deux terminaux (Ctrl+C). Pour supprimer la démonstration :

```bash
docker rm -f oz-demo-postgres && docker volume rm oz-demo-postgres && rm -rf .demo
```

## Limites connues

- Football seulement : la base n'a pas de champ « sport » ; les icônes des autres sports existent
  dans `@oz/ui`, le multi-sport demandera une migration et un ADR.
- Une photo déposée à l'écran reste « Vérification en cours » tant que le worker et ClamAV ne
  tournent pas (configurations `worker` de `.claude/launch.json`, service `clamav`) ; les photos des
  joueurs fictifs sont posées comme déjà analysées. Vidéos : « Bientôt disponible ».
- Pas d'écusson de club réel : l'API ne rend pas encore le nom de l'organisation (écusson générique).
- Les emails partent vers Mailpit (<http://localhost:8025>).

# Effets d'interface — catalogue et coût

Référence : `design.md` §8.7, ADR-009, ADR-011. Lots 1.5ba (registre Pilotage), 1.5bb (registre Émotion)
et 1.5ca (direction « sport » d'après la maquette Manus).
Composants : `packages/ui`. Règles :

- seuls `transform` et `opacity` sont animés ;
- chaque effet a un repli sous `prefers-reduced-motion`, testé dans Chromium (`effects.browser.test.tsx`) ;
- aucun effet de confiance avant la réponse du serveur (CP-19) ;
- aucun effet lié à l'âge d'un joueur (EX-T16).

## Statut

| #   | Effet                   | Composant                       | Statut                                                |
| --- | ----------------------- | ------------------------------- | ----------------------------------------------------- |
| E1  | Halo vert               | `Halo`                          | Fait (1.5bb)                                          |
| E2  | Révélation de l'OZ ID   | `OzIdCard reveal`, `OzIdReveal` | Fait (1.5bb)                                          |
| E3  | Dégradé du bouton       | `Button`                        | Fait (0.10, 1.5a)                                     |
| E4  | Activation du vert      | `Button`                        | Fait (0.10)                                           |
| E5  | Focus de champ          | `Field`, `Select`               | Fait (0.10)                                           |
| E6  | Bloc mineur             | `Callout open live`             | Fait (1.5ba)                                          |
| E7  | Progression d'étape     | `StepProgress`                  | Fait (1.5ba)                                          |
| E8  | Case du code active     | `OtpInput`                      | Fait (1.5ba)                                          |
| E9  | Sélection de carte      | `ChoiceCardGroup`               | Fait (1.5ba)                                          |
| E10 | Anneau de score         | —                               | Retiré : OZ Score hors première version (Q18)         |
| E11 | Radar                   | —                               | Phase 2 (tests de performance)                        |
| E12 | Barres de mesure        | `MeasureBar`                    | Fait (1.5ba)                                          |
| E13 | Badge « Vérifié »       | `Badge confirmed animate`       | Fait (1.5ba)                                          |
| E14 | Squelettes              | `Skeleton`, `SkeletonGroup`     | Fait (1.5ba)                                          |
| E15 | Pagination du splash    | `DotPagination`                 | Fait (1.5ba)                                          |
| E16 | Cercles du terrain      | `PitchCircles`                  | Fait (1.5bb)                                          |
| E17 | Néon lime               | —                               | Retiré par la charte (ADR-009 : rose, sans néon)      |
| E18 | Verre dépoli            | `GlassPanel`                    | Fait (1.5bb) ; repli opaque sans support ou réduit    |
| E19 | Carte d'Afrique         | —                               | Reporté : tableau de bord fédération, Phase 2 (D-129) |
| E20 | Puces pays flottantes   | `FloatingChip`                  | Fait (1.5bb)                                          |
| E21 | Lumière de stade, bokeh | —                               | Reporté : photo libre de droits à fournir (D-129)     |
| E22 | Cadres métalliques or   | —                               | Retiré par la charte (ADR-009 : pas d'or)             |

### Direction sport (lot 1.5ca, ADR-011)

| Effet                    | Composant                      | Repli (mouvement réduit)                       |
| ------------------------ | ------------------------------ | ---------------------------------------------- |
| Héros de stade           | `StadiumHero`                  | Faisceaux et cercles fixes ; texte sans montée |
| Pastille « en direct »   | `LivePanel`                    | Pastille fixe ; panneau opaque sans flou       |
| Halo du bouton principal | `Button glow` (vert, pas lime) | Sans ombre ; jamais sur un bouton inactif      |
| Flèche qui glisse        | `Button` (`data-arrow`)        | Flèche fixe                                    |
| Barres au défilement     | `MeasureBar animateOnView`     | Barres pleines d'emblée                        |
| Montée des cartes        | `ValueCard`                    | Bordure verte seule                            |

E17 reste retiré : le halo utilise le vert de la charte. Le héros n'a pas de photo tant qu'aucune photo
libre de droits n'est fournie (E21, D-129) ; les faisceaux sont bornés par `STADIUM_GLOWS` pour que le
texte reste AA même superposé (test `stadium-hero.test.tsx`).

## Coût mesuré

`pnpm --filter @oz/ui test:perf` mesure les effets en boucle : images par seconde sur 2 s, Chromium sans
affichage, processeur ralenti ×4 par CDP (proche d'un Android d'entrée de gamme). Le seuil est de 50 i/s.
La commande est hors CI, car le résultat dépend de la machine.

| Effet                  | Mesure du 2026-11-11 (Mac, Chromium, ×4) |
| ---------------------- | ---------------------------------------- |
| E1 halo                | 60,2 i/s                                 |
| E14 squelettes (8)     | 60,3 i/s                                 |
| E16 cercles du terrain | 60,4 i/s                                 |
| E18 verre dépoli       | 60,2 i/s                                 |
| E20 puces pays (6)     | 60,2 i/s                                 |

| Effet (lot 1.5ca)           | Mesure du 2026-11-10 (Mac, Chromium, ×4) |
| --------------------------- | ---------------------------------------- |
| Héros de stade avec panneau | 60,2 i/s                                 |
| Pastille « en direct »      | 60,2 i/s                                 |
| Bouton à halo               | 60,2 i/s                                 |
| Barres au défilement (3)    | 60,2 i/s                                 |

Poids CSS généré par `@oz/ui` (Tailwind 4.3, minifié) : 38,7 Ko → 55,3 Ko, soit **7,7 → 9,8 Ko gzip
(+2,1 Ko)** pour tout le lot 1.5ca, sous le budget de 12 Ko.

Lot 1.5cc (ADR-012, mesure du 2026-11-11) : thème noir et lime, police système (aucun fichier de
police téléchargé hors JetBrains Mono), statistiques et cadres : 58,9 Ko, soit **10,3 Ko gzip
(+0,5 Ko)**, toujours sous les 12 Ko. Halos du héros de stade abaissés (lime 8 %, bleu 6 %, 3 %) pour
garder `text-muted` au-dessus de 4,5:1. Les tests de fluidité (`test:perf`, 9) restent à 60 i/s.

Les effets ponctuels (E2, E6 à E9, E12, E13, E15) durent moins de 1 s, en transform et opacité. La
mesure sur un vrai téléphone d'entrée de gamme reste à faire en recette (D-129).

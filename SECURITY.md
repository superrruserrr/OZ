# Politique de signalement des vulnérabilités

OZ traite des données d'identité, dont celles de mineurs. Toute faiblesse de sécurité doit nous
parvenir en privé, avant toute publication.

## Versions couvertes

| Version                     | Couverte |
| --------------------------- | -------- |
| `main` (production)         | Oui      |
| `develop` (recette, aperçu) | Oui      |
| Branches de fonctionnalité  | Non      |

Le service n'est pas encore en ligne (DEBT D-051) : jusqu'à la mise en ligne, seuls les contributeurs
du dépôt privé peuvent signaler.

## Signaler une vulnérabilité

- **Jamais** dans une issue, une PR, un commentaire ou un canal public.
- Contributeurs du dépôt : message direct à Gaëtan Wassu, responsable de la sécurité du projet.
- Adresse publique de signalement : **à publier avant la mise en ligne** (DEBT D-053). Elle sera
  reprise ici et dans `/.well-known/security.txt` (RFC 9116).

Indiquer : composant et version (commit), étapes de reproduction, impact estimé, et si des données
réelles ont pu être exposées. Ne pas joindre de données personnelles réelles : décrire le champ, pas
sa valeur.

## Délais

| Étape                                   | Délai cible                       |
| --------------------------------------- | --------------------------------- |
| Accusé de réception                     | 3 jours ouvrés                    |
| Qualification (gravité, périmètre)      | 7 jours ouvrés                    |
| Correctif d'une vulnérabilité critique  | 7 jours                           |
| Correctif d'une vulnérabilité élevée    | 30 jours                          |
| Notification d'une violation de données | 72 h après sa constatation (§6.8) |

Une vulnérabilité exposant des données de mineurs est toujours traitée comme critique.

## Divulgation coordonnée

Nous demandons de ne rien publier avant le correctif, ou 90 jours au plus après l'accusé de
réception. Nous informons l'auteur de chaque étape et le créditons s'il le souhaite. Une recherche
menée de bonne foi, sans accès aux données d'autrui au-delà du nécessaire pour démontrer le problème,
sans dégradation du service ni ingénierie sociale, ne fera l'objet d'aucune poursuite de notre part.

Hors périmètre : déni de service volumétrique, tests sur les comptes d'autres personnes, attaques
physiques ou sociales, rapports d'outils automatiques sans démonstration d'impact.

## Pour aller plus loin

- [Politique de sécurité](docs/security/policy.md) : mesures en place et prévues.
- [Modèle de menaces](docs/security/threats.md) : les huit risques de la plateforme.

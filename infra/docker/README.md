# infra/docker

Environnement de développement local (lot 0.2, TD-004). Données synthétiques uniquement (R10).

## Commandes

| Commande          | Effet                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev:up`     | Crée `.env` depuis `.env.example` s'il manque, lève les services, attend qu'ils soient `healthy`, active les extensions PostgreSQL (`pgcrypto`, `pg_trgm`, `unaccent`) et crée le bucket S3 |
| `pnpm dev:status` | État des services ; code de sortie non nul si l'un n'est pas prêt                                                                                                                           |
| `pnpm dev:down`   | Arrête les services, **conserve** les données                                                                                                                                               |
| `pnpm dev:reset`  | Arrête les services et **supprime** les données (volumes `oz-*`), après confirmation « oui » (ou `--yes`)                                                                                   |

Prérequis : Docker Desktop lancé, au moins 4 Go de mémoire allouée (ClamAV ≈ 2 Go).

## Services et ports (publiés sur 127.0.0.1 uniquement)

| Service    | Image                               | Port local              | Usage                                                                                   |
| ---------- | ----------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `postgres` | `postgres:16.15-alpine`             | 5432                    | Base de données. **Version majeure à aligner sur Scaleway Managed PostgreSQL (TD-009)** |
| `redis`    | `redis:7.4.11-alpine`               | 6379                    | Cache, sessions, files BullMQ                                                           |
| `s3`       | `chrislusf/seaweedfs:4.50`          | 8333                    | Stockage compatible S3 (remplace MinIO, dont l'image officielle a été retirée)          |
| `clamav`   | `clamav/clamav:1.5.4-debian13-slim` | 3310                    | Antivirus ; le premier démarrage télécharge les signatures (jusqu'à quelques minutes)   |
| `mailpit`  | `axllent/mailpit:v1.32.0`           | 1025 (SMTP), 8025 (web) | Capture des emails : http://localhost:8025                                              |

Les ports se changent dans `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, `CLAMAV_PORT`, `SMTP_PORT`, `MAILPIT_UI_PORT`).

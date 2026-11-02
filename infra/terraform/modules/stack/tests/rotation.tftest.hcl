# Rotation des secrets PostgreSQL (lot 0.8b) : chaque URL de Secret Manager suit le mot de passe de son
# rôle, y compris quand un utilisateur est recréé seul (revue adversariale, point 4).

mock_provider "scaleway" {
  mock_resource "scaleway_rdb_instance" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
  mock_resource "scaleway_secret" {
    defaults = { id = "fr-par/11111111-1111-1111-1111-111111111111" }
  }
}

variables {
  env                = "staging"
  tags               = ["oz", "env:staging", "managed-by:terraform"]
  node_type          = "DB-DEV-S"
  ha                 = false
  volume_size_gb     = 10
  private_network_id = "fr-par/11111111-1111-1111-1111-111111111111"
  secrets_path       = "/oz/staging"
  password_version   = 1
}

run "initial" {
  module {
    source = "../postgres"
  }
}

run "meme_plan" {
  module {
    source = "../postgres"
  }

  assert {
    condition     = output.secret_versions == run.initial.secret_versions
    error_message = "Sans changement, aucune URL ne doit être réécrite."
  }
}

run "utilisateur_app_recree" {
  module {
    source = "../postgres"
  }

  plan_options {
    replace = [scaleway_rdb_user.app]
  }

  assert {
    condition     = output.secret_versions["DATABASE_URL"] != run.initial.secret_versions["DATABASE_URL"]
    error_message = "oz_app recréé (nouveau mot de passe) : DATABASE_URL doit être réécrite."
  }

  assert {
    condition     = output.secret_versions["DATABASE_MIGRATION_URL"] == run.initial.secret_versions["DATABASE_MIGRATION_URL"]
    error_message = "oz_migrator inchangé : DATABASE_MIGRATION_URL ne doit pas bouger."
  }

  assert {
    condition     = output.secret_versions["WORKER_DATABASE_URL"] == run.initial.secret_versions["WORKER_DATABASE_URL"]
    error_message = "oz_worker inchangé : WORKER_DATABASE_URL ne doit pas bouger."
  }
}

run "rotation" {
  module {
    source = "../postgres"
  }

  variables {
    password_version = 2
  }

  assert {
    condition     = output.secret_versions["DATABASE_URL"] != run.utilisateur_app_recree.secret_versions["DATABASE_URL"]
    error_message = "Rotation : DATABASE_URL doit être réécrite."
  }

  assert {
    condition     = output.secret_versions["DATABASE_MIGRATION_URL"] != run.utilisateur_app_recree.secret_versions["DATABASE_MIGRATION_URL"]
    error_message = "Rotation : DATABASE_MIGRATION_URL doit être réécrite."
  }

  assert {
    condition     = output.secret_versions["WORKER_DATABASE_URL"] != run.utilisateur_app_recree.secret_versions["WORKER_DATABASE_URL"]
    error_message = "Rotation : WORKER_DATABASE_URL doit être réécrite."
  }
}

run "utilisateur_migrator_recree" {
  module {
    source = "../postgres"
  }

  variables {
    password_version = 2
  }

  plan_options {
    replace = [scaleway_rdb_user.migrator]
  }

  assert {
    condition     = output.secret_versions["DATABASE_MIGRATION_URL"] != run.rotation.secret_versions["DATABASE_MIGRATION_URL"]
    error_message = "oz_migrator recréé : DATABASE_MIGRATION_URL doit être réécrite."
  }

  assert {
    condition     = output.secret_versions["DATABASE_URL"] == run.rotation.secret_versions["DATABASE_URL"]
    error_message = "oz_app inchangé : DATABASE_URL ne doit pas bouger."
  }
}

run "utilisateur_worker_recree" {
  module {
    source = "../postgres"
  }

  variables {
    password_version = 2
  }

  plan_options {
    replace = [scaleway_rdb_user.worker]
  }

  assert {
    condition     = output.secret_versions["WORKER_DATABASE_URL"] != run.utilisateur_migrator_recree.secret_versions["WORKER_DATABASE_URL"]
    error_message = "oz_worker recréé : WORKER_DATABASE_URL doit être réécrite."
  }

  assert {
    condition     = output.secret_versions["DATABASE_URL"] == run.utilisateur_migrator_recree.secret_versions["DATABASE_URL"]
    error_message = "oz_app inchangé : DATABASE_URL ne doit pas bouger."
  }
}

#!/usr/bin/env bash
# Outils de sécurité de la CI (lot 0.7, décision D5) : binaires officiels, versions et empreintes
# SHA-256 figées ici. Une archive dont l'empreinte diffère fait échouer l'installation.
# Versions publiées depuis plus de deux semaines au moment du choix (chaîne d'approvisionnement).
set -euo pipefail

DEST="${1:?usage: install-ci-tools.sh <dossier de destination>}"
mkdir -p "$DEST"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

install_tool() {
  local name="$1" url="$2" sha256="$3"
  curl -fsSL --retry 3 -o "$WORK/$name.tar.gz" "$url"
  echo "$sha256  $WORK/$name.tar.gz" | sha256sum --check --strict -
  tar -xzf "$WORK/$name.tar.gz" -C "$WORK" "$name"
  install -m 0755 "$WORK/$name" "$DEST/$name"
  "$DEST/$name" --version
}

install_tool gitleaks \
  https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz \
  551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb

install_tool trivy \
  https://github.com/aquasecurity/trivy/releases/download/v0.75.0/trivy_0.75.0_Linux-64bit.tar.gz \
  c6e65abddb348e25f10549df887045629cf28cc72453cd1c63acb717316b3f3f

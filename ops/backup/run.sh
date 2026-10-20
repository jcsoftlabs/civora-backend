#!/bin/sh
# Point d'entrée du conteneur. Le nom du service Railway décide d'abord (« backup » : la copie de chaque nuit,
# « restore-check » : le test de restauration du mois), pour qu'une variable partagée ne transforme pas l'un en
# l'autre ; sans nom de service (essais locaux), BACKUP_MODE.
set -eu
dir="$(dirname "$0")"
service=$(printf '%s' "${RAILWAY_SERVICE_NAME:-}" | tr '[:upper:]' '[:lower:]')
case "$service" in
  *restore*) mode=restore-check ;;
  *backup*) mode=backup ;;
  *) mode="${BACKUP_MODE:-backup}" ;;
esac
echo "Mode : $mode"
case "$mode" in
  backup) exec sh "$dir/backup.sh" ;;
  restore-check) exec sh "$dir/restore-check.sh" ;;
  *) echo "BACKUP_MODE inconnu : $mode" >&2; exit 2 ;;
esac

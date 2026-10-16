#!/bin/sh
# Point d'entrée du conteneur : BACKUP_MODE=backup (chaque nuit) ou restore-check (chaque mois).
set -eu
dir="$(dirname "$0")"
case "${BACKUP_MODE:-backup}" in
  backup) exec sh "$dir/backup.sh" ;;
  restore-check) exec sh "$dir/restore-check.sh" ;;
  *) echo "BACKUP_MODE inconnu : ${BACKUP_MODE}" >&2; exit 2 ;;
esac

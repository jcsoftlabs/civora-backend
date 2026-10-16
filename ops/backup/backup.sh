#!/bin/sh
# NFR-06 : sauvegarde quotidienne de la base, chiffrée, gardée 30 jours.
# Rôle civora_backup : lecture seule, BYPASSRLS (sinon la RLS forcée viderait les tables des partis).
# Copie chiffrée (AES-256, phrase de passe hors du stockage) déposée dans un compartiment R2 distinct de celui des
# fichiers, puis effacement des copies de plus de BACKUP_RETENTION_DAYS jours. Échec : alerte par e-mail.
set -eu
. "$(dirname "$0")/lib.sh"

need DATABASE_URL_BACKUP BACKUP_PASSPHRASE
[ "$(target)" = r2 ] && need R2_ACCOUNT_ID R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail() {
  alert "civora : sauvegarde en échec" "La sauvegarde de la base a échoué à l'étape : $1. Heure (UTC) : $(date -u '+%Y-%m-%d %H:%M')."
  exit 1
}

ts=$(date -u +%Y-%m-%dT%H%M%SZ)
key="$PREFIX/$(date -u +%Y/%m)/civora-$ts.dump.enc"

pg_dump --format=custom --compress=6 --file="$work/db.dump" "$DATABASE_URL_BACKUP" || fail "copie de la base (pg_dump)"
# La copie doit être lisible avant d'être envoyée.
pg_restore --list "$work/db.dump" >/dev/null || fail "lecture de la copie"
tables=$(pg_restore --list "$work/db.dump" | grep -c " TABLE DATA " || true)
[ "$tables" -gt 10 ] || fail "copie incomplète ($tables tables)"

openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE \
  -in "$work/db.dump" -out "$work/db.enc" || fail "chiffrement"
store_put "$work/db.enc" "$key" || fail "envoi vers le stockage"

size=$(wc -c <"$work/db.enc" | tr -d ' ')
echo "Sauvegarde déposée : $key ($size octets, $tables tables)"

# Rétention : on n'efface que des copies plus anciennes que la limite, et jamais la dernière.
now=$(date -u +%s)
limit=$((now - RETENTION_DAYS * 86400))
latest=$(store_list "$PREFIX/" | tail -n 1)
store_list "$PREFIX/" | while read -r old; do
  [ -n "$old" ] && [ "$old" != "$latest" ] || continue
  e=$(key_epoch "$old")
  if [ "$e" -gt 0 ] && [ "$e" -lt "$limit" ]; then
    store_delete "$old" && echo "Copie expirée effacée : $old"
  fi
done

# Battement de cœur de la supervision : son absence pendant plus d'un jour déclenche une alerte.
if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl --fail --silent --show-error --retry 3 "$BACKUP_HEARTBEAT_URL" >/dev/null || echo "Battement non transmis" >&2
fi

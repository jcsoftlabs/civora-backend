#!/bin/sh
# NFR-06 : restauration testée. Prend la dernière copie, la déchiffre et la restaure dans un Postgres temporaire
# lancé dans le conteneur (jamais sur la base de production), puis contrôle son contenu. Le compte rendu part par
# e-mail, réussite comme échec : c'est la preuve du test trimestriel.
set -eu
. "$(dirname "$0")/lib.sh"

need BACKUP_PASSPHRASE
[ "$(target)" = r2 ] && need R2_ACCOUNT_ID R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY_ID R2_BACKUP_SECRET_ACCESS_KEY
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-30}"
export LC_ALL=C

work=$(mktemp -d)
pgdata="$work/data"
# Chemin court : un socket Unix est limité à une centaine de caractères.
sock="/tmp/civora-check-$$"
as_pg() { if [ "$(id -u)" = 0 ]; then su-exec postgres "$@"; else "$@"; fi; }
stop_pg() { [ -f "$pgdata/postmaster.pid" ] && as_pg pg_ctl -D "$pgdata" -m immediate stop >/dev/null 2>&1 || true; }
trap 'stop_pg; rm -rf "$work" "$sock"' EXIT
fail() {
  alert "civora : test de restauration en échec" "Le test de restauration a échoué à l'étape : $1. Copie : ${key:-aucune}. Heure (UTC) : $(date -u '+%Y-%m-%d %H:%M')."
  exit 1
}

key=$(store_list "postgres/" | tail -n 1)
[ -n "$key" ] || fail "aucune copie trouvée"
age_h=$((($(date -u +%s) - $(key_epoch "$key")) / 3600))
[ "$age_h" -le "$MAX_AGE_HOURS" ] || fail "dernière copie trop ancienne (${age_h} h)"

store_get "$key" "$work/db.enc" || fail "téléchargement"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE \
  -in "$work/db.enc" -out "$work/db.dump" || fail "déchiffrement"

mkdir -p "$pgdata" "$sock"
[ "$(id -u)" = 0 ] && chown -R postgres "$work" "$sock"
as_pg initdb -D "$pgdata" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null || fail "création du Postgres temporaire"
as_pg pg_ctl -D "$pgdata" -l "$work/server.log" -o "-c listen_addresses='' -k $sock" -w start >/dev/null || {
  tail -n 20 "$work/server.log" >&2
  fail "démarrage du Postgres temporaire"
}
psql_check() { as_pg psql -h "$sock" -U postgres -d restore_check -v ON_ERROR_STOP=1 -At -c "$1"; }

as_pg psql -h "$sock" -U postgres -d postgres -q -c "create database restore_check" || fail "création de la base d'essai"
# Les rôles cités par les politiques et les droits doivent exister pour que la restauration passe sans erreur.
for r in civora_owner civora_app civora_bi civora_backup; do
  as_pg psql -h "$sock" -U postgres -d postgres -q -c "create role $r" || fail "rôle $r"
done
as_pg pg_restore -h "$sock" -U postgres -d restore_check --exit-on-error "$work/db.dump" || fail "restauration (pg_restore)"

parties=$(psql_check "select count(*) from parties") || fail "lecture des partis"
members=$(psql_check "select count(*) from members") || fail "lecture des membres"
migrations=$(psql_check "select count(*) from drizzle.__drizzle_migrations") || fail "lecture des migrations"
rls=$(psql_check "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity") || fail "contrôle de la RLS"
audit=$(psql_check "select count(*) from audit_log") || fail "lecture du journal d'audit"
[ "$parties" -ge 1 ] || fail "aucun parti dans la copie"
[ "$rls" -ge 20 ] || fail "politiques d'isolation absentes ($rls tables protégées)"

report="Restauration réussie.
Copie : $key (il y a $age_h h)
Organisations : $parties
Membres : $members
Lignes du journal d'audit : $audit
Migrations : $migrations
Tables protégées par la RLS : $rls
La copie a été restaurée dans un Postgres temporaire, puis effacée."
echo "$report"
alert "civora : test de restauration réussi" "$report"

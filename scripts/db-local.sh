#!/usr/bin/env bash
# Postgres local sans Docker : cluster dans .pgdata (ignoré par git), rôles civora_owner, civora_app, civora_bi.
# Usage : scripts/db-local.sh start | stop | status | reset
# Avec Docker, `docker compose up -d` fait la même chose ; ce script sert quand Docker n'est pas installé.
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.pgdata"
PORT="${PGPORT:-5432}"
PASS="${LOCAL_DB_PASSWORD:-change-me}"

BIN="${PG_BIN:-}"
if [ -z "$BIN" ]; then
  for v in 16 17 18; do
    if [ -x "/opt/homebrew/opt/postgresql@$v/bin/pg_ctl" ]; then BIN="/opt/homebrew/opt/postgresql@$v/bin"; break; fi
  done
fi
[ -n "$BIN" ] || { echo "Postgres introuvable : brew install postgresql@16" >&2; exit 1; }

init() {
  [ -d "$DATA" ] && return
  "$BIN/initdb" -D "$DATA" -U civora_owner --auth=scram-sha-256 --pwfile=<(echo "$PASS") -E UTF8 --locale=C >/dev/null
  echo "Cluster créé dans .pgdata"
}

start() {
  init
  if ! "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
    "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start >/dev/null
  fi
  export PGPASSWORD="$PASS"
  local psql=("$BIN/psql" -h localhost -p "$PORT" -U civora_owner -v ON_ERROR_STOP=1 -q)
  "${psql[@]}" -d postgres -tc "select 1 from pg_database where datname='civora'" | grep -q 1 \
    || "${psql[@]}" -d postgres -c "create database civora"
  # Les mots de passe locaux sont fixés ici ; en production ils viennent du gestionnaire de secrets.
  "${psql[@]}" -d civora <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_app') THEN CREATE ROLE civora_app LOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civora_bi') THEN CREATE ROLE civora_bi LOGIN NOBYPASSRLS; END IF;
END \$\$;
ALTER ROLE civora_app PASSWORD '$PASS';
ALTER ROLE civora_bi PASSWORD '$PASS';
SQL
  echo "Postgres prêt sur localhost:$PORT (base civora)"
}

case "${1:-start}" in
  start) start ;;
  stop) "$BIN/pg_ctl" -D "$DATA" stop ;;
  status) "$BIN/pg_ctl" -D "$DATA" status ;;
  reset) "$BIN/pg_ctl" -D "$DATA" stop 2>/dev/null || true; rm -rf "$DATA"; start ;;
  *) echo "Usage : $0 start|stop|status|reset" >&2; exit 1 ;;
esac

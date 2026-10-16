#!/bin/sh
# Fonctions communes aux sauvegardes (NFR-06) : stockage R2 par l'API S3 (curl signé SigV4, sans autre outil),
# alerte par e-mail (Resend). Aucun secret n'est écrit dans les journaux.

need() {
  for v in "$@"; do
    eval "val=\${$v:-}"
    [ -n "$val" ] || { echo "Variable manquante : $v" >&2; exit 2; }
  done
}

# Destination : BACKUP_TARGET=r2 (production) ou file:///chemin (essais locaux).
target() { printf '%s' "${BACKUP_TARGET:-r2}"; }

# Par défaut, le compartiment et la clé des fichiers de l'API, sous le préfixe backups/ ; un compartiment et une
# clé à part (R2_BACKUP_*) restent possibles pour que l'API ne puisse pas effacer les sauvegardes.
R2_BACKUP_BUCKET="${R2_BACKUP_BUCKET:-${R2_BUCKET:-}}"
R2_BACKUP_ACCESS_KEY_ID="${R2_BACKUP_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
R2_BACKUP_SECRET_ACCESS_KEY="${R2_BACKUP_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
PREFIX="${BACKUP_PREFIX:-backups/postgres}"

r2_url() { printf 'https://%s.r2.cloudflarestorage.com/%s' "$R2_ACCOUNT_ID" "$R2_BACKUP_BUCKET"; }

r2_curl() {
  curl --fail --silent --show-error --retry 3 --retry-delay 5 \
    --aws-sigv4 "aws:amz:auto:s3" --user "$R2_BACKUP_ACCESS_KEY_ID:$R2_BACKUP_SECRET_ACCESS_KEY" \
    -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" "$@"
}

# put <fichier local> <clé>
store_put() {
  case "$(target)" in
    file://*) d="${BACKUP_TARGET#file://}"; mkdir -p "$d/$(dirname "$2")"; cp "$1" "$d/$2" ;;
    *) r2_curl -X PUT --upload-file "$1" "$(r2_url)/$2" >/dev/null ;;
  esac
}

# get <clé> <fichier local>
store_get() {
  case "$(target)" in
    file://*) cp "${BACKUP_TARGET#file://}/$1" "$2" ;;
    *) r2_curl -o "$2" "$(r2_url)/$1" ;;
  esac
}

# delete <clé>
store_delete() {
  case "$(target)" in
    file://*) rm -f "${BACKUP_TARGET#file://}/$1" ;;
    *) r2_curl -X DELETE "$(r2_url)/$1" >/dev/null ;;
  esac
}

# Clés sous un préfixe, une par ligne, triées (le nom porte la date, donc l'ordre est chronologique).
store_list() {
  case "$(target)" in
    file://*)
      d="${BACKUP_TARGET#file://}"
      [ -d "$d/$1" ] || return 0
      (cd "$d" && find "$1" -type f | sort)
      ;;
    *)
      token=""
      while :; do
        q="list-type=2&prefix=$1"
        [ -n "$token" ] && q="$q&continuation-token=$(printf '%s' "$token" | sed 's/+/%2B/g;s/\//%2F/g;s/=/%3D/g')"
        xml=$(r2_curl "$(r2_url)?$q")
        printf '%s' "$xml" | tr '<' '\n' | sed -n 's/^Key>//p'
        token=$(printf '%s' "$xml" | tr '<' '\n' | sed -n 's/^NextContinuationToken>//p')
        [ -n "$token" ] || break
      done | sort
      ;;
  esac
}

# Alerte par e-mail ; sans clé Resend (essais locaux), le message va dans le journal.
alert() {
  subject="$1"
  body="$2"
  if [ -n "${RESEND_API_KEY:-}" ] && [ -n "${ALERT_EMAIL:-}" ]; then
    json=$(printf '%s' "$body" | sed 's/\\/\\\\/g;s/"/\\"/g' | awk 'BEGIN{ORS="\\n"} {print}')
    curl --fail --silent --show-error -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" \
      -d "{\"from\":\"civora <notifications@civora.space>\",\"to\":[\"$ALERT_EMAIL\"],\"subject\":\"$subject\",\"text\":\"$json\"}" \
      >/dev/null || echo "Alerte non envoyée" >&2
  else
    echo "ALERTE : $subject"
    echo "$body"
  fi
}

# Horodatage UTC contenu dans une clé « …/civora-2026-10-15T070000Z.dump.enc » → secondes depuis 1970.
key_epoch() {
  ts=$(printf '%s' "$1" | sed -n 's/.*civora-\([0-9-]*\)T\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)Z.*/\1 \2:\3:\4/p')
  [ -n "$ts" ] || { echo 0; return; }
  date -u -d "$ts" +%s 2>/dev/null || date -u -j -f "%Y-%m-%d %H:%M:%S" "$ts" +%s
}

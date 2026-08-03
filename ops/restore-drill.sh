#!/bin/sh
set -eu

require() {
  value=$(printenv "$1" 2>/dev/null || true)
  [ -n "$value" ] || { echo "$1 is required" >&2; exit 1; }
}

require BACKUP_FILE
require BACKUP_ENCRYPTION_PASSWORD_FILE
require RESTORE_DATABASE_URL
require RESTORE_EVIDENCE_PATH

[ -f "$BACKUP_FILE" ] || { echo "Encrypted backup is unavailable" >&2; exit 1; }
[ -f "$BACKUP_FILE.sha256" ] || { echo "Backup checksum is unavailable" >&2; exit 1; }
[ -f "$BACKUP_ENCRYPTION_PASSWORD_FILE" ] || { echo "Backup password file is unavailable" >&2; exit 1; }
if stat -c '%a' "$BACKUP_ENCRYPTION_PASSWORD_FILE" >/dev/null 2>&1; then
  password_mode=$(stat -c '%a' "$BACKUP_ENCRYPTION_PASSWORD_FILE")
else
  password_mode=$(stat -f '%Lp' "$BACKUP_ENCRYPTION_PASSWORD_FILE")
fi
[ "$password_mode" = "600" ] || { echo "Backup password file must have mode 0600" >&2; exit 1; }
case "$RESTORE_EVIDENCE_PATH" in /*) ;; *) echo "Restore Evidence path must be absolute" >&2; exit 1 ;; esac

RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" node -e '
  const name = new URL(process.env.RESTORE_DATABASE_URL).pathname.slice(1);
  if (!/(restore|drill)/i.test(name)) process.exit(1);
' || { echo "Restore database name must contain restore or drill" >&2; exit 1; }

if [ -d "$RESTORE_EVIDENCE_PATH" ] && [ -n "$(find "$RESTORE_EVIDENCE_PATH" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  echo "Restore Evidence path must not contain data" >&2
  exit 1
fi

command -v pg_restore >/dev/null
command -v psql >/dev/null
command -v openssl >/dev/null
umask 077
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/genbioca-restore.XXXXXX")
cleanup() {
  case "$work_dir" in */genbioca-restore.*) rm -rf "$work_dir" ;; esac
}
trap cleanup EXIT HUP INT TERM

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256")
else
  (cd "$(dirname "$BACKUP_FILE")" && shasum -a 256 -c "$(basename "$BACKUP_FILE").sha256")
fi

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$BACKUP_FILE" \
  -out "$work_dir/bundle.tar" \
  -pass "file:$BACKUP_ENCRYPTION_PASSWORD_FILE"
tar -C "$work_dir" -xf "$work_dir/bundle.tar"
(
  cd "$work_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c manifest.sha256
  else
    shasum -a 256 -c manifest.sha256
  fi
)

pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "$RESTORE_DATABASE_URL" "$work_dir/database.dump"
mkdir -p "$RESTORE_EVIDENCE_PATH"
chmod 700 "$RESTORE_EVIDENCE_PATH"
tar -C "$RESTORE_EVIDENCE_PATH" -xf "$work_dir/evidence.tar"

psql -X -A -t "$RESTORE_DATABASE_URL" -c \
  "SELECT json_build_object('tenants',(SELECT count(*) FROM tenants),'kpis',(SELECT count(*) FROM kpi_definitions),'gaps',(SELECT count(*) FROM gaps),'capas',(SELECT count(*) FROM capas),'registers',(SELECT count(*) FROM operational_register_records),'evidence',(SELECT count(*) FROM evidence),'imports',(SELECT count(*) FROM import_batches));"

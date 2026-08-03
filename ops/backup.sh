#!/bin/sh
set -eu

require() {
  value=$(printenv "$1" 2>/dev/null || true)
  [ -n "$value" ] || { echo "$1 is required" >&2; exit 1; }
}

require DATABASE_URL
require EVIDENCE_STORAGE_PATH
require BACKUP_PATH
require BACKUP_ENCRYPTION_PASSWORD_FILE

case "$EVIDENCE_STORAGE_PATH:$BACKUP_PATH" in
  /*:/*) ;;
  *) echo "Evidence and backup paths must be absolute" >&2; exit 1 ;;
esac
[ -d "$EVIDENCE_STORAGE_PATH" ] || { echo "Evidence storage is unavailable" >&2; exit 1; }
[ -f "$BACKUP_ENCRYPTION_PASSWORD_FILE" ] || { echo "Backup password file is unavailable" >&2; exit 1; }
if stat -c '%a' "$BACKUP_ENCRYPTION_PASSWORD_FILE" >/dev/null 2>&1; then
  password_mode=$(stat -c '%a' "$BACKUP_ENCRYPTION_PASSWORD_FILE")
else
  password_mode=$(stat -f '%Lp' "$BACKUP_ENCRYPTION_PASSWORD_FILE")
fi
[ "$password_mode" = "600" ] || { echo "Backup password file must have mode 0600" >&2; exit 1; }

command -v pg_dump >/dev/null
command -v openssl >/dev/null
command -v tar >/dev/null
mkdir -p "$BACKUP_PATH"
umask 077

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/genbioca-backup.XXXXXX")
cleanup() {
  case "$work_dir" in */genbioca-backup.*) rm -rf "$work_dir" ;; esac
}
trap cleanup EXIT HUP INT TERM

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="genbioca-$timestamp"
pg_dump --format=custom --no-owner --no-acl --file "$work_dir/database.dump" "$DATABASE_URL"
tar -C "$EVIDENCE_STORAGE_PATH" -cf "$work_dir/evidence.tar" .

(
  cd "$work_dir"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum database.dump evidence.tar > manifest.sha256
  else
    shasum -a 256 database.dump evidence.tar > manifest.sha256
  fi
  tar -cf "$base.tar" database.dump evidence.tar manifest.sha256
)

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$work_dir/$base.tar" \
  -out "$BACKUP_PATH/$base.tar.enc" \
  -pass "file:$BACKUP_ENCRYPTION_PASSWORD_FILE"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$BACKUP_PATH" && sha256sum "$base.tar.enc" > "$base.tar.enc.sha256")
else
  (cd "$BACKUP_PATH" && shasum -a 256 "$base.tar.enc" > "$base.tar.enc.sha256")
fi

printf '%s\n' "$BACKUP_PATH/$base.tar.enc"

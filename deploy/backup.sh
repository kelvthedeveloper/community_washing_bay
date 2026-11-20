#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${LOCAL_DATABASE_PATH:?LOCAL_DATABASE_PATH must be set}"

backup_dir="${BACKUP_DIR:-/var/backups/community-washing-bay}"
media_root="${MEDIA_ROOT:-/srv/community-washing-bay/backend/private_media}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
password_file="$(mktemp)"
connection_file="$(mktemp)"
trap 'rm -f "$password_file" "$connection_file"' EXIT

install -d -o root -g root -m 0700 "$backup_dir"
python3 "$(dirname "$0")/parse_database_url.py" \
    "$DATABASE_URL" "$password_file" > "$connection_file"
mapfile -d '' -t connection < "$connection_file"
if [[ "${#connection[@]}" -ne 5 ]]; then
    echo "Could not read the PostgreSQL connection URL." >&2
    exit 1
fi

python3 -c 'import sqlite3, sys; source = sqlite3.connect(sys.argv[1]); target = sqlite3.connect(sys.argv[2]); source.backup(target); target.close(); source.close()' \
    "$LOCAL_DATABASE_PATH" "$backup_dir/local-database-$timestamp.sqlite3"
tar -czf "$backup_dir/media-$timestamp.tar.gz" -C "$media_root" .

PGPASSFILE="$password_file" PGSSLMODE="${connection[4]}" pg_dump \
    --host="${connection[0]}" \
    --port="${connection[1]}" \
    --username="${connection[3]}" \
    --format=custom \
    --no-owner \
    --file="$backup_dir/database-$timestamp.dump" \
    "${connection[2]}"

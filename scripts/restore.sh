#!/usr/bin/env sh
set -eu

backup_directory="${1:-}"
if [ -z "$backup_directory" ] || [ ! -f "$backup_directory/postgres.dump" ] || [ ! -f "$backup_directory/uploads.tar.gz" ]; then
  echo "Uso: CONFIRM_RESTORE=RESTAURAR ./scripts/restore.sh /caminho/do/backup" >&2
  exit 1
fi
if [ "${CONFIRM_RESTORE:-}" != "RESTAURAR" ]; then
  echo "Restauração substitui banco e uploads. Defina CONFIRM_RESTORE=RESTAURAR para confirmar." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$backup_directory" && sha256sum -c SHA256SUMS)
else
  (cd "$backup_directory" && shasum -a 256 -c SHA256SUMS)
fi
docker compose up -d db
docker compose stop app 2>/dev/null || true

echo "Restaurando PostgreSQL..."
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --exit-on-error' < "$backup_directory/postgres.dump"

echo "Restaurando uploads..."
docker compose run --rm --no-deps -T app sh -c 'find /app/storage/uploads -mindepth 1 -delete && tar -C /app/storage/uploads -xzf -' < "$backup_directory/uploads.tar.gz"

docker compose run --rm --no-deps migrate
docker compose up -d app
echo "Restauração concluída. Verifique /api/health e o painel administrativo."

#!/usr/bin/env sh
set -eu

destination_root="${1:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$destination_root/$timestamp"
mkdir -p "$destination"
chmod 700 "$destination"

echo "Criando backup do PostgreSQL..."
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-acl' > "$destination/postgres.dump"

echo "Criando backup dos arquivos persistentes..."
docker compose exec -T app tar -C /app/storage/uploads -czf - . > "$destination/uploads.tar.gz"

{
  echo "created_at_utc=$timestamp"
  echo "git_commit=$(git rev-parse HEAD 2>/dev/null || echo unavailable)"
  echo "compose_project=${COMPOSE_PROJECT_NAME:-academia-juridico-contabil}"
} > "$destination/manifest.txt"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$destination" && sha256sum postgres.dump uploads.tar.gz manifest.txt > SHA256SUMS)
else
  (cd "$destination" && shasum -a 256 postgres.dump uploads.tar.gz manifest.txt > SHA256SUMS)
fi
chmod 600 "$destination"/*
echo "Backup concluído em: $destination"
echo "Copie esse diretório para armazenamento externo e cifrado. O arquivo .env não está incluído."

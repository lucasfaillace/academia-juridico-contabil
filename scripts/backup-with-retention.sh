#!/usr/bin/env sh
set -eu

# Backup com retenção automática por quantidade.
# Uso: ./scripts/backup-with-retention.sh <BACKUP_DIR> [QUANTIDADE]
# O padrão mantém os 7 backups mais recentes.

backup_root="${1:-./backups}"
max_backups="${2:-7}"

case "$max_backups" in
  ''|*[!0-9]*|0)
    echo "A quantidade de backups deve ser um número inteiro maior que zero." >&2
    exit 1
    ;;
esac

mkdir -p "$backup_root"

echo "📦 Criando backup..."

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp"
mkdir -p "$destination"
chmod 700 "$destination"

# Database - com compressão máxima
echo "  → PostgreSQL dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-acl' > "$destination/postgres.dump"

# Uploads - com compressão
echo "  → Arquivos de upload"
docker compose exec -T app tar -C /app/storage/uploads -czf - . > "$destination/uploads.tar.gz"

# Manifest e checksums
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

# Remover backups antigos mantendo apenas a quantidade configurada
echo "🗑️  Mantendo apenas os $max_backups backups mais recentes..."
backup_count=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d | wc -l)

if [ "$backup_count" -gt "$max_backups" ]; then
  # Os diretórios usam timestamp UTC no nome; ordenar pelo nome também os
  # ordena cronologicamente, sem depender da extensão GNU `find -printf`.
  find "$backup_root" -mindepth 1 -maxdepth 1 -type d | \
    sort | \
    head -n $((backup_count - max_backups)) | \
    while IFS= read -r backup_dir; do
      if [ -d "$backup_dir" ]; then
        size_mb=$(du -sm "$backup_dir" 2>/dev/null | cut -f1 || echo "?")
        rm -rf "$backup_dir"
        echo "  ✓ Removido: $(basename "$backup_dir") ($size_mb MB)"
      fi
    done
else
  echo "  ✓ Nenhum backup expirou (total: $backup_count/$max_backups)"
fi

# Estatísticas finais
total_size=$(du -sh "$backup_root" 2>/dev/null | cut -f1 || echo "0")
backup_count_final=$(find "$backup_root" -mindepth 1 -maxdepth 1 -type d | wc -l)

echo ""
echo "✅ Backup concluído em: $destination"
echo "📊 Tamanho total: $total_size (máximo: $max_backups backups mantidos)"
echo "📋 Backups armazenados: $backup_count_final/$max_backups"
echo ""
echo "⚠️  Não esqueça de copiar backups para armazenamento externo e cifrado!"

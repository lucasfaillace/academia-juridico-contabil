#!/usr/bin/env sh
set -eu

# Backup com retenção automática e economia de espaço
# Uso: ./scripts/backup-with-retention.sh <BACKUP_DIR> [DAYS_TO_KEEP]
# Padrão: 7 dias de retenção

backup_root="${1:-./backups}"
days_to_keep="${2:-7}"
seconds_to_keep=$((days_to_keep * 24 * 60 * 60))
current_time=$(date +%s)

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
  echo "compose_project=academia-juridico-contabil"
} > "$destination/manifest.txt"

(cd "$destination" && sha256sum postgres.dump uploads.tar.gz manifest.txt > SHA256SUMS)
chmod 600 "$destination"/*

# Limpar backups antigos
echo "🗑️  Limpando backups com mais de $days_to_keep dias..."
deleted_count=0
for backup_dir in "$backup_root"/*/; do
  [ -d "$backup_dir" ] || continue
  backup_time=$(date -d "$(basename \"$backup_dir\" | sed 's/T/ /' | sed 's/Z/)" +%s 2>/dev/null || echo 0)
  age=$((current_time - backup_time))
  
  if [ "$age" -gt "$seconds_to_keep" ]; then
    size_mb=$(du -sm "$backup_dir" | cut -f1)
    rm -rf "$backup_dir"
    echo "  ✓ Removido: $(basename \"$backup_dir\") ($size_mb MB)"
    deleted_count=$((deleted_count + 1))
  fi
done

if [ "$deleted_count" -eq 0 ]; then
  echo "  ✓ Nenhum backup expirou"
fi

# Estatísticas
total_size=$(du -sh "$backup_root" | cut -f1)
echo ""
echo "✅ Backup concluído em: $destination"
echo "📊 Tamanho do diretório: $total_size"
echo "📋 Retenção: $days_to_keep dias"
echo ""
echo "⚠️  Não esqueça de copiar backups para armazenamento externo e cifrado!"

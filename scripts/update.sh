#!/usr/bin/env sh
set -eu

branch="${DEPLOY_BRANCH:-main}"
backup_root="${BACKUP_ROOT:-./backups}"

./scripts/backup.sh "$backup_root"
git fetch --prune origin
git checkout "$branch"
git pull --ff-only origin "$branch"
docker compose build --pull app migrate
docker compose run --rm --no-deps migrate
docker compose up -d --remove-orphans app db
docker compose ps
echo "Atualização concluída. Confirme a saúde em https://SEU_DOMINIO/api/health."

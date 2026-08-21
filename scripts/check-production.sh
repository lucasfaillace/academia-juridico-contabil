#!/usr/bin/env sh
set -eu

check_run_id="${GITHUB_RUN_ID:-local-$$}-${GITHUB_RUN_ATTEMPT:-1}"
check_project_name="academia-production-check-${check_run_id}"

case "$check_project_name" in
  academia-production-check-*) ;;
  *) echo "Nome inseguro para o projeto isolado de validação." >&2; exit 1 ;;
esac

export APP_IMAGE_TAG="production-check"
export APP_PORT="0"

compose() {
  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" --project-name "$check_project_name" "$@"
  else
    docker compose --project-name "$check_project_name" "$@"
  fi
}

cleanup() {
  # O nome forçado impede que esta rotina alcance os volumes do projeto real.
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup 0
trap 'exit 129' 1
trap 'exit 130' 2
trap 'exit 143' 15

compose config --quiet
compose build app
compose run --rm --no-deps app node --version
compose up -d --wait

# Confirma que o entrypoint real passou pela validação de ambiente e que a
# aplicação alcança o PostgreSQL dentro da rede do Compose.
compose exec -T app node -e '
  fetch("http://127.0.0.1:3000/api/health")
    .then(async (response) => {
      const payload = await response.json();
      if (response.status !== 200 || payload.status !== "ok") process.exit(1);
    })
    .catch(() => process.exit(1));
'

# Confere a política realmente emitida pelo servidor de produção, além da
# auditoria estática do artefato executada antes da construção da imagem.
compose exec -T app node -e '
  fetch("http://127.0.0.1:3000/")
    .then(async (response) => {
      const csp = response.headers.get("content-security-policy") || "";
      if (response.status !== 200
        || !/script-src-attr\s+\x27none\x27/.test(csp)
        || csp.includes("unsafe-eval")
        || csp.includes("img-src https:")) process.exit(1);
    })
    .catch(() => process.exit(1));
'

# Executa novamente a imagem de migração para verificar idempotência e compara
# o registro do banco com a quantidade de arquivos incluídos na imagem.
compose run --rm migrate
set -- migrations/*.sql
expected_migrations="$#"
applied_migrations="$(compose exec -T db sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "SELECT count(*) FROM app_migrations"')"
if [ "$applied_migrations" -ne "$expected_migrations" ]; then
  echo "Migrações no banco (${applied_migrations}) divergem dos arquivos (${expected_migrations})." >&2
  exit 1
fi

# Exercita paginação e pesquisa com milhares de referências e um ano de
# visualizações em uma transação descartada ao final.
compose exec -T db sh -c 'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"' < scripts/check-scalability.sql

echo "Compose isolado, imagem, migrações, bootstrap e healthcheck validados."

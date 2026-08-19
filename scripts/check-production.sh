#!/usr/bin/env sh
set -eu

docker compose config --quiet
docker compose build app
docker compose run --rm --no-deps app node --version
echo "Compose, imagem e runtime validados."

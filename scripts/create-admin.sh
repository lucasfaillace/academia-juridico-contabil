#!/usr/bin/env sh
set -eu

env_file="${1:-.env}"
if [ ! -f "$env_file" ]; then
  echo "Arquivo $env_file não encontrado. Copie .env.example antes." >&2
  exit 1
fi

printf "E-mail do administrador: "
IFS= read -r admin_email
case "$admin_email" in
  *@*.*) ;;
  *) echo "E-mail inválido." >&2; exit 1 ;;
esac

printf "Senha (mínimo de 12 caracteres): "
stty -echo
IFS= read -r admin_password
stty echo
printf "\nConfirme a senha: "
stty -echo
IFS= read -r admin_password_confirmation
stty echo
printf "\n"

if [ "$admin_password" != "$admin_password_confirmation" ]; then
  echo "As senhas não coincidem." >&2
  exit 1
fi
if [ "${#admin_password}" -lt 12 ]; then
  echo "A senha precisa ter pelo menos 12 caracteres." >&2
  exit 1
fi

docker compose build app >/dev/null
ADMIN_PASSWORD_INPUT="$admin_password"
export ADMIN_PASSWORD_INPUT
admin_hash="$(docker compose run --rm --no-deps -e ADMIN_PASSWORD_INPUT app node scripts/hash-password.mjs)"
unset ADMIN_PASSWORD_INPUT admin_password admin_password_confirmation

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT HUP INT TERM
awk -v email="$admin_email" -v hash="$admin_hash" '
  BEGIN { seen_email=0; seen_hash=0 }
  /^ADMIN_EMAIL=/ { print "ADMIN_EMAIL=" email; seen_email=1; next }
  /^ADMIN_PASSWORD_HASH=/ { print "ADMIN_PASSWORD_HASH=\047" hash "\047"; seen_hash=1; next }
  { print }
  END {
    if (!seen_email) print "ADMIN_EMAIL=" email
    if (!seen_hash) print "ADMIN_PASSWORD_HASH=\047" hash "\047"
  }
' "$env_file" > "$tmp_file"
mv "$tmp_file" "$env_file"
chmod 600 "$env_file"
trap - EXIT HUP INT TERM
echo "Administrador configurado. Recrie a aplicação com: docker compose up -d --force-recreate app"

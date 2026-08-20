# Backup, restauração e continuidade

Um backup completo contém o PostgreSQL e o volume de uploads. O script não inclui `.env` para evitar espalhar credenciais.

## Criar

```bash
cd /opt/academia/app
./scripts/backup.sh /var/backups/academia
```

Cada execução cria um diretório UTC com:

- `postgres.dump`: dump customizado, comprimido e independente de proprietário;
- `uploads.tar.gz`: imagens e demais arquivos persistentes;
- `manifest.txt`: data, revisão do código e projeto;
- `SHA256SUMS`: verificação de integridade.

Copie o diretório para fora da VPS, preferencialmente cifrado. Use a regra 3-2-1: três cópias, dois tipos de mídia e uma cópia fora do servidor.

## Restaurar

A restauração é destrutiva e exige confirmação explícita:

```bash
cd /opt/academia/app
./scripts/backup.sh /var/backups/academia-pre-restauracao
CONFIRM_RESTORE=RESTAURAR ./scripts/restore.sh /var/backups/academia/AAAAmmddTHHMMSSZ
```

Valide depois:

```bash
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

## Automação

Agendamento diário às 03:15 UTC:

```bash
(crontab -l 2>/dev/null; echo '15 3 * * * cd /opt/academia/app && ./scripts/backup.sh /var/backups/academia >> /var/backups/academia/backup.log 2>&1') | crontab -
```

Monitore espaço livre e teste uma restauração completa pelo menos trimestralmente. Nunca considere um backup válido apenas porque o comando terminou: valide checksums e faça restauração de ensaio.

Arquivos sem referência podem ser auditados, sem remoção, com `docker compose exec app node scripts/reconcile-uploads.mjs`. A exclusão exige `--apply` e deve ocorrer somente depois de um backup validado; consulte a seção **Reconciliar arquivos de upload** em `DEPLOYMENT.md`.

# Estratégia de Backup e Retenção

## O que é Backup?

O projeto faz backup de **dados críticos apenas** (não é uma imagem do sistema):

- ✅ **PostgreSQL**: Banco de dados completo (dump custom comprimido)
- ✅ **Uploads**: Imagens e arquivos do usuário
- ✅ **Manifest**: Informações de quando foi feito e qual commit
- ❌ **Código**: Já está no Git (sem necessidade)
- ❌ **Docker Images**: Reconstroem a partir do Dockerfile
- ❌ `.env`: Mantido seguro fora do backup (você gerencia manualmente)

## Backup Atual (Sem Script de Retenção)

Se você rodar `./scripts/backup.sh` diariamente:

```bash
# Sem limpeza automática:
/var/backups/academia/
  ├── 20260820T031500Z/  (~100-500 MB, depende da quantidade de uploads)
  ├── 20260821T031500Z/
  ├── 20260822T031500Z/
  └── ...
```

**Problema**: Acumula indefinidamente. Após 1 ano com 365 backups diários:
- Se cada backup = 300 MB → **~110 GB de espaço consumido**
- Se cada backup = 50 MB → **~18 GB de espaço consumido**

## Solução Recomendada: Retenção Automática

O novo script `backup-with-retention.sh`:

1. **Cria o backup** (igual ao anterior)
2. **Deleta automaticamente** os backups excedentes mais antigos
3. **Economiza espaço**: por padrão, mantém no máximo as 7 cópias mais recentes

### Implementação

```bash
# Substitua a linha no crontab:
# De:
15 3 * * * cd /opt/academia/app && ./scripts/backup.sh /var/backups/academia >> /var/backups/academia/backup.log 2>&1

# Para:
15 3 * * * cd /opt/academia/app && ./scripts/backup-with-retention.sh /var/backups/academia 7 >> /var/backups/academia/backup.log 2>&1
```

### Espaço Consumido com Retenção

Com um agendamento diário mantendo **7 cópias recentes**:

| Tamanho por backup | Espaço máximo | Observação |
|---|---|---|
| 50 MB | ~350 MB | Pequeno projeto |
| 200 MB | ~1.4 GB | Médio projeto |
| 500 MB | ~3.5 GB | Projeto grande |

### Cronograma Sugerido

```bash
# Backup diário mantendo as 7 cópias mais recentes (padrão)
15 3 * * * cd /opt/academia/app && ./scripts/backup-with-retention.sh /var/backups/academia 7 >> /var/backups/academia/backup.log 2>&1

# Ou: Backup diário mantendo as 30 cópias mais recentes
15 3 * * * cd /opt/academia/app && ./scripts/backup-with-retention.sh /var/backups/academia 30 >> /var/backups/academia/backup.log 2>&1

# Ou: Backup 3x por semana mantendo as 21 cópias mais recentes
15 3 * * 0,3,5 cd /opt/academia/app && ./scripts/backup-with-retention.sh /var/backups/academia 21 >> /var/backups/academia/backup.log 2>&1
```

## Implementar Hoje: Vai Dar Erro?

**NÃO**. Totalmente seguro:

1. O novo script é **100% compatível** com backups antigos
2. Ele só **deleta backups antigos** (não afeta dados em execução)
3. Se houver erro, você mantém todos os backups que não foram deletados
4. A aplicação continua rodando normalmente durante o backup

### Passo a Passo Seguro

```bash
# 1. Fazer backup manual "de segurança" antes de mudar
cd /opt/academia/app
./scripts/backup.sh /var/backups/academia-pre-rotacao

# 2. Testar o novo script manualmente
./scripts/backup-with-retention.sh /var/backups/academia 7

# 3. Ver o que foi feito
du -sh /var/backups/academia/*/

# 4. Quando satisfeito, atualizar o crontab
(crontab -l; echo '15 3 * * * cd /opt/academia/app && ./scripts/backup-with-retention.sh /var/backups/academia 7 >> /var/backups/academia/backup.log 2>&1') | crontab -

# 5. Monitorar por uma semana
tail -f /var/backups/academia/backup.log
```

## Armazenamento Externo (Essencial!)

Os backups **nunca devem ficar apenas no servidor**:

```bash
# Exemplo: Copiar para S3 (Amazon)
aws s3 cp /var/backups/academia/latest.tar.gz s3://seu-bucket/academia-backups/ \
  --sse AES256 --storage-class GLACIER

# Exemplo: Copiar para B2 (Backblaze)
b2 sync /var/backups/academia/ s3://seu-bucket-b2/academia/

# Exemplo: rsync para outro servidor
rsync -avP --delete /var/backups/academia/ usuario@outro-servidor:/backups/academia/
```

## Teste de Restauração (Recomendado)

Faça **pelo menos trimestralmente**:

```bash
# Simular restauração em staging (não é o servidor de produção!)
cd /opt/academia/staging  # ou outro diretório
CONFIRM_RESTORE=RESTAURAR ./scripts/restore.sh /var/backups/academia/20260820T031500Z

# Validar
curl -fsS http://127.0.0.1:3000/api/health
```

## Resumo de Espaço

| Estratégia | Espaço | Dias | Frequência |
|---|---|---|---|
| **Sem retenção** | ~110 GB/ano | Infinito | Diário |
| **7 dias** | ~350 MB-3.5 GB | 7 | Diário |
| **30 dias** | ~1.5 GB-15 GB | 30 | Diário |
| **21 dias + 3x/semana** | ~700 MB-7 GB | 21 | Terça, quinta, sábado |

**Recomendação para VPS 20 GB SSD**: se o agendamento for diário, mantenha de 7 a 14 cópias recentes.

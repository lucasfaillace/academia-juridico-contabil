# Academia Jurídico-Contábil

Aplicação Next.js/Node.js com PostgreSQL e editor visual próprio, incluindo notas de rodapé, preparada para servidor Linux convencional. Não usa Vercel, edge runtime, funções serverless nem banco proprietário.

## Desenvolvimento

Requisitos: Node.js 22.13 ou mais recente, pnpm e PostgreSQL 15+.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

## Produção em VPS

A produção usa:

- aplicação e PostgreSQL em Docker Compose;
- aplicação publicada somente em `127.0.0.1:3000`;
- Nginx e Certbot no host para domínio e HTTPS;
- volumes Docker para banco e uploads;
- migrações transacionais e idempotentes;
- logs Docker com rotação;
- reinicialização automática com `restart: unless-stopped`.

Siga [DEPLOYMENT.md](DEPLOYMENT.md) do início ao fim. Backup e restauração estão detalhados em [BACKUP.md](BACKUP.md).

## Verificação do código

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Validação adicional, em uma máquina com Docker:

```bash
./scripts/check-production.sh
```

Essa validação cria um projeto Compose temporário e isolado, constrói a imagem,
executa as migrações duas vezes, inicia o entrypoint real de produção e consulta
o healthcheck. Ao terminar, remove somente os contêineres e volumes identificados
pelo prefixo exclusivo `academia-production-check-`; os volumes da aplicação não
são acessados.

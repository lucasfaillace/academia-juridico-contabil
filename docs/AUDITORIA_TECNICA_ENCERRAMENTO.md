# Encerramento da auditoria técnica

Data da revalidação: 21 de agosto de 2026.

Este documento registra o encerramento das dez etapas de correção dos achados A1–A15 da auditoria técnica. A Cloudflare permanece opcional; a produção oficial continua sendo Node.js em Docker Compose, PostgreSQL interno e Nginx/Certbot no host.

## Situação dos achados

| Achado | Situação | Evidência principal |
|---|---|---|
| A1 — build quebrado por código legado | Corrigido | `pnpm typecheck`, `pnpm build` e a construção da imagem Docker passam. |
| A2 — endpoint administrativo legado | Corrigido | O login usa somente a rota canônica e a rota incompatível foi removida. |
| A3 — JSON malformado gerava erro 500 | Corrigido | Leitor compartilhado retorna entrada inválida; testes cobrem JSON válido, vazio e malformado. |
| A4 — painel carregava artigos completos | Corrigido | A listagem administrativa é paginada e transfere resumos; o conteúdo integral é carregado sob demanda. |
| A5 — salvamento automático recarregava o painel | Corrigido | O estado local é atualizado sem nova carga integral de artigos e tags. |
| A6 — pesquisa ignorava full-text search | Corrigido | A pesquisa usa o índice GIN para o conteúdo e mantém busca complementar nos metadados. |
| A7 — limpeza no caminho de cada visualização | Corrigido | A manutenção foi retirada do registro de pageview e transferida para script próprio. |
| A8 — estatísticas carregavam todo o histórico | Corrigido | O período é filtrado no PostgreSQL antes da agregação. |
| A9 — similaridade e exportações sem limites | Corrigido | Há pré-seleção indexada, limites configuráveis e geração progressiva do ZIP. |
| A10 — limite de PDF incompatível | Corrigido | Aplicação, painel e Nginx usam o mesmo limite documentado. |
| A11 — uploads órfãos | Corrigido | Substituições removem arquivos desvinculados com segurança e há reconciliação em modo de diagnóstico/aplicação. |
| A12 — ambiente não validado no boot | Corrigido | O entrypoint de produção valida URL, segredos, credenciais e hash antes de iniciar o servidor. |
| A13 — rate limit somente em memória | Mitigado e documentado | O Compose mantém uma única instância de `app`; o limite e a exigência de armazenamento compartilhado antes de escalar réplicas estão documentados em `DEPLOYMENT.md`. |
| A14 — CSP permissiva | Corrigido | A CSP é efetiva em produção, sem `unsafe-eval`, com origens explicitamente limitadas. |
| A15 — ausência de CI | Corrigido | O GitHub Actions executa lint, tipos, testes, migrações, build, auditoria e validação Docker. |

## Revalidação final

Foram executadas com sucesso:

- instalação com lockfile congelado (`pnpm install --frozen-lockfile`);
- lint (`pnpm lint`);
- verificação TypeScript (`pnpm typecheck`);
- 50 testes automatizados (`pnpm test`);
- build otimizado de produção (`pnpm build`);
- auditoria das dependências de produção (`pnpm audit --prod`), sem vulnerabilidades conhecidas;
- validação sintática de todos os scripts shell;
- validação e construção do Docker Compose;
- inicialização de `db`, `migrate` e `app`, todos com resultado saudável;
- execução idempotente das 19 migrações existentes;
- respostas HTTP 200 para página inicial, Blog, A Academia, Publicações, Privacidade, Termos e healthcheck;
- criação de backup do PostgreSQL e dos uploads, validação dos checksums e restauração em banco isolado;
- comparação da restauração com a origem, seguida da remoção do banco e dos arquivos temporários de teste.

Nenhum volume persistente foi excluído ou recriado durante a revalidação. O banco original não foi substituído.

## Limites conhecidos e decisões operacionais

- O limitador interno em memória é adequado ao único contêiner `app` previsto. Antes de adicionar réplicas, deve ser substituído ou complementado por um limitador compartilhado no PostgreSQL, Redis ou proxy.
- A Cloudflare gratuita pode ser usada para DNS, proxy e cache de conteúdo público, mas não é dependência da aplicação. O painel, as APIs mutáveis e demais conteúdos dinâmicos não devem ser armazenados em cache.
- O teste manual de login deve usar a credencial administrativa vigente no ambiente. A senha provisória anterior não corresponde ao hash atualmente carregado e não foi redefinida durante a auditoria.
- Testes com centenas de artigos e milhares de referências continuam recomendados antes de uma expansão relevante do acervo, embora as consultas críticas e seus índices já tenham sido reestruturados.


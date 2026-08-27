# Regras permanentes do projeto

- Preserve integralmente a marca oficial em `public/marca-oficial.png`; derivados só podem recortar área vazia, sem redesenho, recoloração ou distorção.
- Todo conteúdo público deve estar em português do Brasil e conteúdo provisório deve ser identificado.
- Não introduza dependência obrigatória de Vercel, edge runtime ou serviço proprietário.
- Mantenha PostgreSQL como persistência de produção e a camada de armazenamento isolada para futura adaptação a S3.
- Trate HTML, formulários e arquivos `.docx` como entrada não confiável; valide tipo, tamanho, autenticação e sanitize antes de persistir.
- Preserve acessibilidade: HTML semântico, contraste, foco visível, teclado, rótulos e preferência de redução de movimento.
- Não inclua gamificação, comentários, trilhas, recomendações automáticas ou checkout próprio.
- A produção oficial é Node.js em Docker Compose, PostgreSQL interno e Nginx/Certbot no host; não reintroduza Vercel, edge runtime, Cloudflare Workers ou funções serverless.
- Nunca publique PostgreSQL em porta do host. A aplicação deve permanecer ligada apenas a `127.0.0.1:3000`, atrás do Nginx.
- Preserve os volumes `postgres_data` e `uploads_data` em atualizações. Nunca use `docker compose down -v` em produção.
- Antes de entregar mudanças, execute `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, validação de shell e, quando Docker estiver disponível, `./scripts/check-production.sh`.

## Protocolo obrigatório de trabalho e aprovação

- Considere o responsável pelo projeto um usuário iniciante: explique termos, comandos, riscos, impacto e possibilidade de reversão em português claro.
- Antes de qualquer alteração, contextualize o problema, reúna evidências em modo somente leitura, proponha a menor mudança possível, liste arquivos e serviços afetados, explique riscos e testes e obtenha autorização explícita.
- Limite cada autorização ao escopo apresentado. Não faça refatorações, atualizações, correções incidentais ou ampliações silenciosas; interrompa e solicite nova autorização quando o escopo mudar.
- Preserve arquivos, dados, volumes, segredos e alterações preexistentes. Não descarte trabalho desconhecido nem use uma limpeza destrutiva para contornar problemas.
- Não altere código, configuração, ambiente, banco, Docker, serviços externos ou produção sem autorização específica. Diagnósticos não autorizam correções.
- Trate `git add`, criação ou troca de branch, commit, pull, merge, rebase, tag, push, pull request e release como ações separadas que exigem autorização explícita. Autorizar uma edição ou commit nunca autoriza push.
- Antes de propor commit ou push, mostre e explique `git status` e `git diff`, procure segredos e arquivos indevidos e execute todos os testes proporcionais à mudança.
- Nunca execute automaticamente `git reset --hard`, `git clean -fd`, `git push --force`, `git push --force-with-lease`, `git checkout -- <arquivo>` ou `git restore <arquivo>`. Explique perda potencial e alternativas recuperáveis antes de pedir autorização específica.
- Não silencie alertas de linters ou analisadores apenas para obter resultado verde. Diferencie erro real de falso positivo e peça autorização antes de corrigir ou documentar uma exceção.
- Se surgir falha, conflito, risco de perda, migração inesperada ou decisão material não prevista, pare, preserve o estado e apresente evidências e alternativas.
- Ao concluir uma etapa, informe ações realizadas, arquivos e serviços afetados, testes e resultados, alertas, riscos residuais, estado do Git e se houve commit ou push.
- Siga integralmente o procedimento detalhado em `docs/FLUXO_SEGURO_DE_DESENVOLVIMENTO.md`.

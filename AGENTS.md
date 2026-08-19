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

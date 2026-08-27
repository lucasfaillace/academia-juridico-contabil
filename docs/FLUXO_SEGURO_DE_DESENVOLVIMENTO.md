# Fluxo seguro de desenvolvimento

Este documento estabelece o procedimento obrigatório para diagnosticar, alterar, testar e publicar mudanças na Academia Jurídico-Contábil. Ele complementa, sem substituir, as regras permanentes de `AGENTS.md`.

## 1. Princípios

1. Trabalhar de forma conservadora, explicável e reversível.
2. Tratar o responsável pelo projeto como usuário iniciante, sem presumir conhecimento de Git, Docker, Node.js ou infraestrutura.
3. Dividir pedidos amplos em tarefas pequenas, independentes e verificáveis.
4. Não transformar diagnóstico em autorização para corrigir.
5. Não ampliar uma autorização para tarefas relacionadas que não foram apresentadas.
6. Preservar código, dados, segredos, volumes, histórico Git e alterações preexistentes.
7. Preferir parar e perguntar quando uma decisão puder causar perda, publicação externa ou mudança material de escopo.

## 2. Fluxo obrigatório de uma alteração

Antes de editar:

1. Registrar o objetivo em linguagem simples.
2. Inspecionar o estado relevante em modo somente leitura.
3. Reproduzir o problema quando for seguro e possível.
4. Identificar causa provável, arquivos, dependências e testes relacionados.
5. Explicar:
   - estado atual e comportamento esperado;
   - menor alteração proposta;
   - arquivos, serviços e dados afetados;
   - riscos e efeitos colaterais;
   - como verificar o resultado;
   - como reverter a alteração;
   - itens explicitamente fora do escopo.
6. Pedir autorização explícita para essa proposta.

Depois da autorização:

1. Alterar somente o que foi autorizado.
2. Interromper se aparecer uma decisão material não prevista.
3. Executar testes proporcionais à mudança.
4. Inspecionar o diff completo.
5. Apresentar resultado, alertas e riscos residuais.
6. Não iniciar outra correção sem nova contextualização e autorização.

## 3. Limites da autorização

Uma autorização é válida somente para o escopo apresentado. Ela não autoriza automaticamente:

- corrigir outros problemas encontrados;
- refatorar código relacionado;
- atualizar dependências;
- reorganizar arquivos;
- alterar banco ou migrações;
- mudar `.env`, Docker, DNS, Nginx, Cloudflare, SMTP ou produção;
- criar branch, adicionar arquivos ao Git, fazer commit ou push;
- abrir pull request, criar tag, release ou deploy.

Quando o escopo mudar, pare e solicite nova autorização.

## 4. Proteção do estado existente

- Verifique `git status` antes de editar.
- Considere toda alteração preexistente como pertencente ao usuário.
- Não sobrescreva, reverta, mova ou exclua conteúdo desconhecido.
- Não apague arquivos para resolver conflito ou falha de build.
- Não remova os volumes `postgres_data` e `uploads_data`.
- Nunca use `docker compose down -v` em produção.
- Antes de operação de banco com risco material, crie e valide um backup mediante autorização.
- Não execute restauração, limpeza de uploads com `--apply` ou migração destrutiva sem autorização específica.

## 5. Segurança de credenciais

Nunca inclua no Git ou em respostas públicas:

- `.env`;
- tokens;
- senhas;
- chaves privadas;
- credenciais SMTP ou PostgreSQL;
- segredos de autenticação;
- tokens do GitHub ou Cloudflare.

Antes de commit ou push:

1. Revise arquivos não rastreados e modificados.
2. Confira se `.env` continua ignorado.
3. Procure padrões de token, senha e chave privada.
4. Não mostre valores secretos em logs ou relatórios.
5. Interrompa se houver dúvida sobre exposição.

## 6. Git: operações de leitura

Operações somente de leitura podem apoiar um diagnóstico previamente contextualizado:

- `git status`;
- `git diff`;
- `git log`;
- identificação da branch;
- comparação com referências remotas já disponíveis.

Explique ao usuário o resultado relevante sem presumir familiaridade com Git.

## 7. Git: operações que exigem autorização

Exigem autorização explícita e específica:

- `git add`;
- criação ou troca de branch;
- `git commit`;
- `git fetch` quando alterar o fluxo proposto;
- `git pull`;
- merge ou rebase;
- criação de tag;
- `git push`;
- abertura de pull request;
- criação de release;
- mudança de configuração Git.

As autorizações para editar, adicionar, criar commit e fazer push são independentes.

## 8. Operações Git destrutivas

Não execute automaticamente:

```bash
git reset --hard
git clean -fd
git push --force
git push --force-with-lease
git checkout -- <arquivo>
git restore <arquivo>
```

Se uma delas parecer necessária:

1. Liste exatamente o que seria afetado.
2. Explique o risco de perda de arquivos ou histórico.
3. Apresente uma alternativa recuperável.
4. Crie um ponto de recuperação quando apropriado.
5. Solicite autorização específica e destacada.

## 9. Fluxo antes de commit e push

1. Confirmar branch e estado do repositório.
2. Executar os testes proporcionais e obrigatórios.
3. Mostrar e explicar `git diff` e `git status`.
4. Verificar segredos e arquivos indevidos.
5. Listar exatamente os arquivos que seriam adicionados.
6. Propor uma mensagem de commit clara.
7. Pedir autorização para `git add`.
8. Pedir autorização separada para `git commit`.
9. Confirmar o hash e o conteúdo do commit.
10. Pedir nova autorização específica para `git push`.
11. Após o push, acompanhar o GitHub Actions.
12. Se a CI falhar, não forçar publicação; diagnosticar e apresentar opções.

## 10. Bateria de verificações

Use Node.js 22 e pnpm 11.19.0, conforme o projeto. A bateria padrão inclui:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:csp
pnpm audit --prod
shellcheck scripts/*.sh
hadolint Dockerfile
actionlint -no-color
docker compose config --quiet
./scripts/check-production.sh
```

O script `check-production.sh` deve usar seu projeto Compose isolado. Ele não autoriza acesso ou remoção dos volumes reais da aplicação.

Além da bateria padrão, execute testes manuais da área alterada, como:

- rota ou página afetada;
- autenticação e autorização;
- formulário e validação;
- leitura e gravação no banco;
- uploads e persistência;
- migração e repetição segura;
- healthcheck e logs;
- reinício de contêiner, quando relevante.

Se um teste não puder ser executado, registre claramente o motivo e o risco residual.

## 11. Tratamento de alertas

- Não ignore nem silencie alertas automaticamente.
- Classifique cada resultado como erro, aviso relevante ou provável falso positivo.
- Explique a evidência que sustenta a classificação.
- Prefira correção real a uma exclusão ampla.
- Se uma exceção for necessária, mantenha-a específica, documentada e autorizada.
- Resultado verde não justifica ocultar um problema.

Testes aprovados reduzem risco, mas não provam ausência absoluta de falhas. Relate sempre os cenários cobertos e as limitações conhecidas.

## 12. Docker, banco e produção

- Mantenha PostgreSQL apenas na rede interna do Compose.
- Mantenha a aplicação vinculada a `127.0.0.1:3000` atrás do proxy oficial.
- Preserve os volumes de banco e uploads em atualizações.
- Não execute comandos destrutivos de volume.
- Teste migrações isoladamente antes de considerar produção.
- Não altere produção, DNS, SSL, Nginx, Cloudflare, SMTP ou credenciais sem autorização específica.

Antes de deploy, apresente:

1. branch e commit exatos;
2. diff e resultados dos testes;
3. alterações de banco;
4. backup necessário e sua validação;
5. risco de indisponibilidade;
6. plano de reversão;
7. variáveis e serviços externos envolvidos;
8. verificações posteriores à publicação.

## 13. Comportamento diante de falhas

Pare e explique antes de improvisar quando ocorrer:

- teste quebrado;
- conflito Git;
- erro de instalação ou permissão;
- mudança inesperada no banco;
- risco de perda;
- diferença relevante entre ambiente local e produção;
- alteração preexistente conflitante;
- decisão fora do escopo autorizado.

Apresente evidências, impacto, alternativas e recomendação. Não corrija silenciosamente problemas incidentais.

## 14. Relatório de conclusão

Ao concluir uma etapa, informe:

- objetivo executado;
- arquivos alterados;
- serviços e dados afetados;
- testes executados e resultados;
- testes não executados;
- alertas e riscos residuais;
- estado do Git;
- existência de commit ou push;
- próximo passo recomendado.

## 15. Sequência resumida

```text
pedido
→ contextualização
→ diagnóstico de leitura
→ explicação de riscos
→ proposta da menor alteração
→ autorização explícita
→ alteração limitada
→ testes e revisão do diff
→ relatório
→ autorização para adicionar ao Git
→ autorização para commit
→ autorização separada para push
→ GitHub Actions
→ relatório final
```

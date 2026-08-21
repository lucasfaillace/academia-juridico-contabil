# Implantação em Ubuntu ou Debian

Este roteiro instala a Academia em uma única VPS. A aplicação e o PostgreSQL ficam em contêineres; Nginx e Certbot ficam no host. As referências oficiais são a documentação de [Docker para Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Docker para Debian](https://docs.docker.com/engine/install/debian/), [proxy reverso do Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) e [Certbot com Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap).

Substitua nos comandos:

- `URL_DO_REPOSITORIO`: URL Git real;
- `academia.seudominio.br`: domínio definitivo;
- `IPV4_DA_VPS` e, se houver, `IPV6_DA_VPS`.

## 1. Preparar o servidor

Use Ubuntu 24.04/26.04 LTS ou Debian 12/13 de 64 bits. Entre por SSH com usuário que tenha `sudo`:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git nginx snapd openssl ufw rsync
sudo timedatectl set-timezone UTC
sudo systemctl enable --now nginx snapd
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

Se o kernel foi atualizado, reinicie e reconecte:

```bash
sudo reboot
```

## 2. Instalar Docker pelo repositório oficial

```bash
sudo apt remove -y docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc || true
. /etc/os-release
case "$ID" in ubuntu|debian) DOCKER_OS="$ID" ;; *) echo "Distribuição não suportada: $ID"; exit 1 ;; esac
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL "https://download.docker.com/linux/$DOCKER_OS/gpg" -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/$DOCKER_OS
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo usermod -aG docker "$USER"
```

Saia da sessão SSH e entre novamente para aplicar o grupo `docker`. Confirme:

```bash
docker version
docker compose version
```

## 3. Clonar o repositório

```bash
sudo install -d -m 0755 -o "$USER" -g "$USER" /opt/academia
git clone URL_DO_REPOSITORIO /opt/academia/app
cd /opt/academia/app
```

Para repositório privado, use uma chave SSH de implantação com acesso somente de leitura. Não grave token no endereço remoto.

## 4. Configurar `.env`

```bash
cd /opt/academia/app
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 64
openssl rand -hex 64
nano .env
```

Use a primeira saída em `POSTGRES_PASSWORD`, a segunda em `AUTH_SECRET` e a terceira em `ANALYTICS_HASH_SECRET`. Configure:

- `NEXT_PUBLIC_SITE_URL=https://academia.seudominio.br`;
- `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX` (opcional; fallback inicial do Google Analytics 4);
- `ANALYTICS_HASH_SECRET=` com o terceiro segredo gerado;
- PostgreSQL (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`);
- administrador (`ADMIN_EMAIL`; o hash será criado no passo 7);
- SMTP e endereços do formulário de contato.

As exportações administrativas possuem limites preventivos configuráveis em `MAX_BULK_ARTICLE_EXPORT`, `MAX_REFERENCE_EXPORT` e `MAX_FICHAMENTO_EXPORT`. Para a VPS mínima de 4 GB, os padrões são, respectivamente, **200 artigos**, **2.000 referências** e **5.000 fichamentos**. O código não aceita valores superiores a 1.000, 10.000 e 25.000 sem uma nova revisão técnica. O ZIP de artigos é enviado progressivamente e cada DOCX é produzido em sequência; aumente os limites somente depois de medir memória e tempo de resposta no servidor. A exportação individual de artigos não é afetada.

As referências administrativas são paginadas e pesquisadas no PostgreSQL. Utilizações e fichamentos detalhados são obtidos somente quando o respectivo painel é aberto. As estatísticas usam agregados diários, preservando os eventos brutos. A arquitetura e a conferência de integridade estão descritas em `docs/ESCALABILIDADE_ETAPA_4.md`.

Valide sem exibir segredos:

```bash
docker compose config --quiet
```

Antes da implantação, valide a imagem e o ciclo completo de produção em um
projeto Compose isolado:

```bash
./scripts/check-production.sh
```

O script constrói a imagem, cria banco e volumes temporários sob o prefixo
`academia-production-check-`, executa as migrações duas vezes, inicia o mesmo
entrypoint usado em produção e consulta `/api/health`. A limpeza alcança somente
esse projeto temporário; os volumes `postgres_data` e `uploads_data` da aplicação
real não são abertos nem removidos.

## 5. Construir e iniciar os serviços

Primeiro construa a imagem para poder gerar a senha administrativa:

```bash
docker compose build app migrate
```

Depois do passo 7, inicie tudo:

```bash
docker compose up -d
docker compose ps
```

O fluxo aguarda o PostgreSQL, executa migrações e só então inicia a aplicação. Nenhuma porta do banco é publicada.

## 6. Executar migrações

O `docker compose up` executa migrações automaticamente. Para executá-las ou auditá-las manualmente:

```bash
docker compose run --rm migrate
docker compose logs --tail=100 migrate
```

Cada migração é registrada com checksum em `app_migrations`, usa transação e trava consultiva para impedir duas execuções simultâneas.

## 7. Criar o primeiro administrador

Execute o assistente. A senha não é exibida nem gravada em histórico:

```bash
cd /opt/academia/app
./scripts/create-admin.sh
```

O script solicita e-mail e senha, gera um hash scrypt com salt aleatório e atualiza apenas `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH` no `.env`. Depois:

```bash
docker compose up -d --force-recreate app
```

O login estará em `https://academia.seudominio.br/admin/login` depois da configuração do domínio e SSL.

A senha deve conter pelo menos 12 caracteres. Depois do primeiro acesso, o administrador pode alterar o e-mail e a senha em **Configurações → Conta administrativa**. A alteração exige a senha atual, grava somente um hash `scrypt` no PostgreSQL, invalida as sessões existentes e exige novo login. As variáveis `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH` permanecem no `.env` apenas como credencial inicial e recuperação quando ainda não houver uma credencial gravada no banco.

O Google Analytics 4 pode ser ativado em **Configurações → Google Analytics 4**. Informe o ID `G-...` e salve; a alteração fica no PostgreSQL e passa a valer nas páginas públicas sem novo build. A variável `NEXT_PUBLIC_GA_MEASUREMENT_ID` permanece opcional como fallback quando não houver configuração salva. O script do Google somente é carregado depois do consentimento do visitante, nunca é carregado em `/admin`, `/admin/login` ou prévias administrativas e também permanece desativado nas páginas públicas enquanto houver uma sessão administrativa autenticada.

## 8. Configurar o domínio no Nginx

Substitua o domínio e instale os arquivos:

```bash
cd /opt/academia/app
sed 's/academia\.exemplo\.br/academia.seudominio.br/g; s/www\.academia\.exemplo\.br/www.academia.seudominio.br/g' nginx/academia.conf.example > /tmp/academia.conf
sudo cp nginx/00-connection-upgrade.conf /etc/nginx/conf.d/00-connection-upgrade.conf
sudo cp /tmp/academia.conf /etc/nginx/sites-available/academia
sudo ln -sfn /etc/nginx/sites-available/academia /etc/nginx/sites-enabled/academia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

O Nginx aceita corpos de até **21 MiB**. A aplicação mantém o limite efetivo do arquivo PDF em **20 MiB** e valida tanto o tipo declarado quanto a assinatura `%PDF-`; o 1 MiB adicional serve apenas para acomodar os metadados do formulário multipart. Assim, um PDF válido no limite anunciado não é recusado antecipadamente pelo proxy. O limite também permanece compatível com o proxy opcional da Cloudflare no plano gratuito.

O arquivo também limita login, contato, comentários e registro de visualizações no proxy. A aplicação mantém uma segunda proteção para esses endpoints públicos. Esse limitador interno usa memória e é adequado ao serviço `app` único definido neste Compose; seus contadores são reiniciados junto com o processo. Antes de executar múltiplas réplicas, configure um limitador compartilhado em PostgreSQL/Redis ou no proxy. A Cloudflare pode acrescentar proteção, mas não é requisito para esses controles.

O Nginx sobrescreve `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Host` e `X-Forwarded-Proto` antes de encaminhar cada requisição, além de remover `CF-Connecting-IP` do tráfego entregue à aplicação. A aplicação usa somente o `X-Real-IP` produzido pelo Nginx para limitação interna e compara mutações com a origem canônica de `NEXT_PUBLIC_SITE_URL`; portanto, não confie em uma configuração própria que apenas repasse esses cabeçalhos recebidos do visitante. A porta `3000` deve continuar acessível exclusivamente por `127.0.0.1`.

Em produção, a aplicação envia uma Política de Segurança de Conteúdo efetiva. Scripts não podem usar `eval`, manipuladores JavaScript em atributos HTML são bloqueados e imagens editoriais persistidas ficam restritas ao próprio site e aos dados locais usados pelo editor. URLs externas de imagens são removidas ao salvar o artigo; o arquivo deve ser enviado ao site para gerar as variantes WebP persistentes. Links bibliográficos externos continuam permitidos. O carregamento externo permitido limita-se ao Google Analytics consentido e aos domínios de vídeo previstos.

A diretiva `unsafe-inline` permanece somente para scripts de hidratação e estilos emitidos pelo runtime do Next.js e por componentes que usam estilos calculados. O artefato compilado é verificado por `pnpm audit:csp`. Um nonce por requisição não foi adotado porque tornaria as páginas estáticas e ISR dinâmicas e eliminaria parte relevante do cache; hashes fixos não cobrem os blocos variáveis de hidratação. Consulte `docs/CSP_ETAPA_5.md` antes de introduzir scripts ou origens externas adicionais.

Confirme que o contêiner responde apenas localmente:

```bash
curl -fsS http://127.0.0.1:3000/api/health
sudo ss -lntp | grep -E ':80|:3000'
```

## 9. Configurar DNS

No painel do registrador/provedor DNS, crie:

| Tipo | Nome | Valor | TTL inicial |
|---|---|---|---|
| A | `academia` | `IPV4_DA_VPS` | 300 |
| AAAA | `academia` | `IPV6_DA_VPS` | 300 |
| CNAME | `www.academia` | `academia.seudominio.br` | 300 |

Não crie AAAA se a VPS não tiver IPv6 funcional. Verifique a propagação:

```bash
dig +short A academia.seudominio.br
dig +short AAAA academia.seudominio.br
```

Os endereços retornados precisam apontar para a VPS antes de solicitar SSL.

## 10. Testar Nginx em HTTP

```bash
sudo nginx -t
curl -I http://academia.seudominio.br
sudo tail -n 100 /var/log/nginx/academia.error.log
```

## 11. Configurar SSL/HTTPS

Instale Certbot pelo snap, conforme recomendação oficial:

```bash
sudo snap install --classic certbot
sudo ln -sfn /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d academia.seudominio.br -d www.academia.seudominio.br --redirect --hsts --staple-ocsp
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

Se não usar `www`, retire o segundo `-d` e remova esse nome do `server_name`. Confirme:

```bash
curl -fsSI https://academia.seudominio.br
```

### 11.1. Cloudflare Free (opcional)

O site não depende da Cloudflare. Ele continua funcionando com DNS comum e acesso direto ao Nginx. Se usar o plano gratuito, configure a Cloudflare somente depois que o HTTPS do passo 11 estiver válido no servidor de origem.

1. Adicione o domínio à Cloudflare e importe os registros DNS.
2. Mantenha os registros `A`/`AAAA` do site como **Proxied** (nuvem laranja).
3. Em **SSL/TLS > Overview**, selecione **Full (strict)**. Não use o modo Flexible.
4. Em **SSL/TLS > Edge Certificates**, ative **Always Use HTTPS**.
5. Em **Caching > Cache Rules**, não crie uma regra “Cache Everything” para o domínio inteiro.
6. Crie uma regra denominada `Páginas públicas da Academia` com a expressão:

```text
(http.request.method eq "GET" and (
  http.request.uri.path eq "/" or
  starts_with(http.request.uri.path, "/blog/") or
  http.request.uri.path eq "/publicacoes"
))
```

Na ação, escolha **Eligible for cache** e, em **Edge TTL**, **Use cache-control header if present, bypass cache if not**. A aplicação define cinco minutos para essas páginas e invalida o endereço alterado após publicação. `/blog` (busca, filtros e paginação), `/admin` e `/api` enviam `no-store` e não devem ser incluídos nessa regra.

As regras oficiais de cache são documentadas em [Cache Rules settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/), o modo TLS em [Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/) e a limpeza em [Purge cache](https://developers.cloudflare.com/cache/how-to/purge-cache/).

#### Limpeza automática após alterações

Crie um API Token restrito à zona, com apenas a permissão **Zone > Cache Purge**. Copie o Zone ID da página de visão geral do domínio e configure no `.env`:

```dotenv
CLOUDFLARE_CACHE_PURGE_ENABLED=true
CLOUDFLARE_ZONE_ID=IDENTIFICADOR_DA_ZONA
CLOUDFLARE_API_TOKEN=TOKEN_RESTRITO
```

Recrie somente a aplicação:

```bash
cd /opt/academia/app
docker compose up -d --force-recreate app
```

Ao salvar ou excluir artigos, publicações, tags e referências vinculadas, a aplicação limpa apenas as URLs ou prefixos afetados. Se as variáveis estiverem ausentes ou a Cloudflare estiver desativada, a publicação continua normalmente e o cache expira pelo TTL; a integração nunca bloqueia a gravação.

Para uma limpeza manual emergencial, use **Caching > Configuration > Purge Cache** no painel. Prefira URLs específicas; use **Purge Everything** somente quando necessário.

#### IP real do visitante no Nginx

Sem esta etapa, o Nginx enxerga o IP do proxy da Cloudflare. A lista deve vir dos endereços oficiais da Cloudflare e só deve ser instalada se o proxy estiver em uso:

```bash
CF_REAL_IP_FILE="$(mktemp)"
curl -fsS https://www.cloudflare.com/ips-v4 | sed 's/^/set_real_ip_from /; s/$/;/' > "$CF_REAL_IP_FILE"
curl -fsS https://www.cloudflare.com/ips-v6 | sed 's/^/set_real_ip_from /; s/$/;/' >> "$CF_REAL_IP_FILE"
printf '%s\n' 'real_ip_header CF-Connecting-IP;' 'real_ip_recursive on;' >> "$CF_REAL_IP_FILE"
sudo install -m 0644 "$CF_REAL_IP_FILE" /etc/nginx/conf.d/cloudflare-real-ip.conf
rm -f "$CF_REAL_IP_FILE"
sudo nginx -t
sudo systemctl reload nginx
```

Atualize esse arquivo quando a Cloudflare alterar suas faixas oficiais. Não aceite `CF-Connecting-IP` de qualquer origem sem restringir `set_real_ip_from`. O módulo `real_ip` converte o endereço validado em `$remote_addr`; em seguida, a configuração do site grava esse valor em `X-Real-IP` e remove o cabeçalho original antes de encaminhar a requisição. A referência é [Restoring original visitor IPs](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/).

Valide a política sem expor credenciais:

```bash
curl -fsSI https://academia.seudominio.br/
curl -fsSI 'https://academia.seudominio.br/blog?q=contabilidade'
curl -fsSI https://academia.seudominio.br/admin/login
```

Na primeira URL pública, `CF-Cache-Status` pode começar como `MISS` e depois mudar para `HIT`. Busca, painel e API devem permanecer `DYNAMIC`/`BYPASS` e apresentar `Cache-Control: private, no-store` quando aplicável.

## 12. Consultar logs e saúde

```bash
cd /opt/academia/app
docker compose ps
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 db
docker compose logs --tail=200 migrate
sudo journalctl -u nginx -n 200 --no-pager
sudo tail -f /var/log/nginx/academia.access.log /var/log/nginx/academia.error.log
curl -fsS https://academia.seudominio.br/api/health
```

Os logs dos contêineres usam rotação local: cinco arquivos de até 10 MB por serviço. Eles não registram senhas nem conteúdo de mensagens deliberadamente.

### Manutenção das chaves temporárias de visualização

As visualizações permanecem armazenadas para os relatórios, mas a chave anônima usada apenas para impedir duplicidade deixa de ser necessária após 48 horas. A limpeza ocorre fora do acesso público, em lotes, e pode ser agendada de hora em hora:

```bash
(crontab -l 2>/dev/null; echo '17 * * * * cd /opt/academia/app && docker compose exec -T app node scripts/cleanup-view-dedupe.mjs >> /var/log/academia-view-cleanup.log 2>&1') | crontab -
```

O comando não exclui visualizações nem altera totais estatísticos; apenas define como nulas chaves temporárias expiradas. O índice parcial criado pela migração `018_article_views_cleanup_index.sql` mantém essa manutenção fora do caminho de cada visita e evita varreduras desnecessárias.

## 13. Atualizar a aplicação

O script atualiza apenas por avanço direto, realiza backup antes da troca, reconstrói a imagem, aplica migrações e recria os serviços:

```bash
cd /opt/academia/app
DEPLOY_BRANCH=main BACKUP_ROOT=/var/backups/academia ./scripts/update.sh
```

Antes da primeira atualização, prepare o diretório:

```bash
sudo install -d -m 0700 -o "$USER" -g "$USER" /var/backups/academia
```

Se a atualização falhar, não apague volumes. Volte o código ao commit anterior somente após avaliar as migrações; quando necessário, restaure o backup pré-atualização.

## 14. Fazer backup

```bash
cd /opt/academia/app
sudo install -d -m 0700 -o "$USER" -g "$USER" /var/backups/academia
./scripts/backup.sh /var/backups/academia
```

O resultado contém `postgres.dump`, `uploads.tar.gz`, manifesto e checksums. Copie cada backup para outro servidor ou armazenamento de objetos cifrado. O `.env` não é incluído; mantenha uma cópia cifrada separada.

Agendamento diário às 03:15 UTC:

```bash
(crontab -l 2>/dev/null; echo '15 3 * * * cd /opt/academia/app && ./scripts/backup.sh /var/backups/academia >> /var/backups/academia/backup.log 2>&1') | crontab -
```

### Reconciliar arquivos de upload

Substituir ou excluir uma publicação remove o PDF anterior somente depois da confirmação no banco e desde que nenhuma outra publicação use a mesma chave. A importação de Word é processada em memória e não conserva uma cópia `.docx` sem vínculo.

Antes de chamar o conversor Word, o servidor inspeciona o contêiner ZIP sem extrair arquivos no disco. Os limites fixados no código são: 15 MiB compactados, 64 MiB descompactados, 1.024 entradas, taxa máxima de expansão de 100:1, 100 imagens, 8 MiB por imagem e 32 MiB para a soma das imagens. XML interno fica limitado a 16 MiB e o HTML resultante ao mesmo teto de 2 milhões de caracteres aceito pelo artigo. Documentos criptografados, ZIP64, caminhos internos inseguros, estruturas inconsistentes e imagens que não sejam JPG, PNG ou WebP são rejeitados. Esses limites protegem a memória da VPS e não dependem da Cloudflare.

Para localizar arquivos antigos que já estejam órfãos, faça primeiro um backup e execute a simulação. Ela consulta artigos e publicações no PostgreSQL, ignora arquivos referenciados, arquivos ocultos e uploads modificados nas últimas 24 horas:

```bash
cd /opt/academia/app
./scripts/backup.sh /var/backups/academia
docker compose exec app node scripts/reconcile-uploads.mjs
```

Revise integralmente a lista. Somente depois, para remover exatamente os candidatos apresentados:

```bash
docker compose exec app node scripts/reconcile-uploads.mjs --apply
```

O comando nunca remove nada sem `--apply` e não deve ser agendado automaticamente. Para ampliar a margem de segurança, use, por exemplo, `--minimum-age-hours=168` para considerar somente arquivos sem referência há pelo menos sete dias.

## 15. Restaurar backup

Faça primeiro um backup do estado atual. Em seguida:

```bash
cd /opt/academia/app
./scripts/backup.sh /var/backups/academia-pre-restauracao
CONFIRM_RESTORE=RESTAURAR ./scripts/restore.sh /var/backups/academia/AAAAmmddTHHMMSSZ
curl -fsS http://127.0.0.1:3000/api/health
```

A restauração valida checksums, interrompe a aplicação, substitui banco e uploads, reaplica migrações pendentes e reinicia o serviço.

## 16. Migrar para outro servidor

1. Baixe o TTL do DNS para 300 pelo menos 24 horas antes.
2. Prepare a nova VPS pelos passos 1 a 7 e clone exatamente a mesma revisão do código.
3. Copie o `.env` por canal seguro e aplique `chmod 600`.
4. Na VPS antiga, interrompa escrita e faça o backup final:

```bash
cd /opt/academia/app
docker compose stop app
./scripts/backup.sh /var/backups/academia-migracao
```

5. Transfira o backup para a nova VPS:

```bash
rsync -avP /var/backups/academia-migracao/ USUARIO@IP_NOVO:/var/backups/academia-migracao/
```

6. Na nova VPS, restaure e valide localmente:

```bash
cd /opt/academia/app
CONFIRM_RESTORE=RESTAURAR ./scripts/restore.sh /var/backups/academia-migracao/AAAAmmddTHHMMSSZ
curl -fsS http://127.0.0.1:3000/api/health
```

7. Configure Nginx/SSL na nova VPS, altere A/AAAA para o novo IP e valide o site.
8. Mantenha a VPS antiga desligada para escrita, mas disponível para reversão, por alguns dias. Depois eleve novamente o TTL.

## Recursos mínimos sugeridos

- mínimo técnico: 1 vCPU, 2 GB RAM, 20 GB SSD e 1 GB de swap;
- recomendado para produção inicial: 2 vCPU, 4 GB RAM, 40 GB SSD NVMe;
- espaço adicional conforme crescimento de imagens, logs e retenção de backups;
- Ubuntu 24.04/26.04 LTS ou Debian 12/13, arquitetura amd64 ou arm64.

## Portas

- `22/tcp`: SSH, restrinja por IP quando possível;
- `80/tcp`: HTTP e validação/redirect do Certbot;
- `443/tcp`: HTTPS público;
- `3000/tcp`: aplicação, vinculada somente a `127.0.0.1`;
- `5432/tcp`: PostgreSQL apenas na rede interna do Compose, não publicado.

## Checklist de publicação

- [ ] DNS A/AAAA aponta para a VPS correta.
- [ ] `.env` tem permissão `600` e não está no Git.
- [ ] Senhas do PostgreSQL, administrador, SMTP, `AUTH_SECRET` e `ANALYTICS_HASH_SECRET` são exclusivas.
- [ ] A inicialização rejeita configuração inválida (`docker compose run --rm --no-deps app node scripts/start-production.mjs --validate-only`).
- [ ] `docker compose ps` mostra `db` e `app` saudáveis.
- [ ] Migrações aparecem como aplicadas.
- [ ] Nginx passa em `sudo nginx -t`.
- [ ] HTTPS responde e `certbot renew --dry-run` passa.
- [ ] A resposta HTTPS contém `Content-Security-Policy`, sem `unsafe-eval`, e não apresenta violações no console nas páginas públicas ou administrativas.
- [ ] Login administrativo funciona.
- [ ] Publicação de artigo, notas de rodapé e persistência após reinício foram testadas.
- [ ] Consentimento de estatísticas foi testado nas opções aceitar, recusar e rever preferências.
- [ ] A área administrativa de estatísticas registra acessos públicos, mas ignora acessos do administrador.
- [ ] Se o GA4 for utilizado, o painel mostra a integração ativa com o identificador `G-...` correto (ou o fallback `NEXT_PUBLIC_GA_MEASUREMENT_ID` está configurado).
- [ ] O GA4 foi testado em página pública e não envia acessos a `/admin`, `/admin/login` nem às prévias administrativas.
- [ ] Se a Cloudflare for utilizada, SSL está em `Full (strict)` e nenhuma regra global de `Cache Everything` alcança `/admin`, `/api` ou `/blog`.
- [ ] Se a limpeza automática da Cloudflare for utilizada, o token tem somente `Cache Purge` na zona correta e não está no Git.
- [ ] A busca do Blog responde com `no-store`; páginas públicas cacheáveis são atualizadas após uma publicação.
- [ ] Formulário de contato envia para o destinatário correto.
- [ ] Backup foi criado, copiado para fora da VPS e restaurado em teste.
- [ ] Páginas provisórias, privacidade e termos foram revisados.

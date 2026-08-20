import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
test("usa a identidade e não mantém o preview inicial", async () => {
  const [page, layout, header, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"), readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("components/Header.tsx", root), "utf8"), readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(page, /Academia Jurídico-Contábil/); assert.match(header, /logo-academia\.png/);
  assert.match(page, /profissionais do Direito e da Contabilidade/);
  assert.doesNotMatch(page, /Conteúdo técnico para profissionais do Direito\.<\/p>/);
  assert.match(layout, /profissionais das duas áreas/);
  assert.match(layout, /lang="pt-BR"/); assert.doesNotMatch(page, /SkeletonPreview/); assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("inclui controles de segurança e portabilidade", async () => {
  const [compose, env, migration, articleApi, imageApi, editor, articlePage, articleHtml, richContent, css, auth, login, nextConfig, cloudflareCache] = await Promise.all([
    readFile(new URL("docker-compose.yml", root), "utf8"), readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("migrations/001_initial.sql", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("app/api/uploads/images/route.ts", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("lib/article-html.ts", root), "utf8"),
    readFile(new URL("components/ArticleRichContent.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/api/auth/login/route.ts", root), "utf8"),
    readFile(new URL("next.config.ts", root), "utf8"),
    readFile(new URL("lib/cloudflare-cache.ts", root), "utf8"),
  ]);
  assert.match(compose, /postgres:17-alpine/); assert.match(env, /AUTH_SECRET/); assert.match(migration, /CHECK \(status IN \('draft','published'\)\)/);
  assert.match(articleApi, /sanitizeHtml/); assert.match(articleApi, /data-footnote/); assert.match(editor, /Inserir nota de rodapé/);
  assert.match(editor, /footnote-number/); assert.match(editor, /footnote-formatting/);
  assert.match(articleHtml, /addFootnoteNumberLinks/);
  assert.match(editor, /Inserir sumário/); assert.match(editor, /Inserir imagem/); assert.match(imageApi, /MAX_IMAGE_SIZE/);
  assert.match(editor, /updateSelectedImage/); assert.match(articleApi, /youtubeUrl/);
  assert.match(editor, /data-image-zoom/); assert.match(editor, /Permitir ampliação/);
  assert.match(articleApi, /data-image-zoom/);
  assert.match(editor, /data-image-border/); assert.match(editor, /Borda do site ativada/); assert.match(editor, /Adicionar borda do site/);
  assert.match(articleApi, /data-image-border/); assert.match(css, /data-image-border="site"/);
  assert.match(editor, /data-image-fit/); assert.match(editor, /Ajustar margens automaticamente/); assert.match(editor, /duas versões WebP/); assert.match(editor, /data-image-frame/);
  assert.match(editor, /cropEmptyImageMargins/); assert.match(editor, /data-image-original-src/); assert.match(editor, /data-image-trimmed-src/);
  assert.match(articleApi, /data-image-fit/); assert.match(css, /data-image-fit="crop"/);
  assert.match(css, /\.editor-sticky-controls \{ position:sticky/);
  assert.match(css, /\.article-content li>p \{ margin:0/);
  assert.match(articlePage, /ArticleRichContent/); assert.match(richContent, /role="dialog"/);
  assert.match(richContent, /event\.key === "Escape"/); assert.match(css, /article-image-lightbox/);
  assert.doesNotMatch(css, /figure\[data-image-display="wide"\]/);
  assert.match(articlePage, /article-video-callout/);
  assert.match(editor, /Intertítulo nível 1/); assert.match(editor, /Intertítulo nível 2/);
  assert.match(editor, /toggleBlockquote/); assert.match(editor, /onMouseDown/);
  assert.doesNotMatch(editor, /numberedHeading/); assert.match(articleHtml, /<ul>/);
  assert.doesNotMatch(articlePage, /<aside className="article-toc"/);
  assert.match(compose, /127\.0\.0\.1:\$\{APP_PORT:-3000\}:3000/);
  assert.doesNotMatch(compose, /5432:5432/);
  assert.match(compose, /uploads_data:\/app\/storage\/uploads/);
  assert.match(auth, /AUTH_SECRET precisa conter pelo menos 32 caracteres/);
  assert.match(login, /consumeRateLimit/);
  assert.match(login, /isSameOriginMutation/);
  assert.match(articleApi, /allowedSchemes: \["http", "https", "mailto"\]/);
  assert.match(articlePage, /replace\(\/<\/g, "\\\\u003c"\)/);
  assert.match(nextConfig, /Content-Security-Policy-Report-Only/);
  assert.match(nextConfig, /Cloudflare-CDN-Cache-Control/);
  assert.match(nextConfig, /source: "\/blog", headers: noStoreHeaders/);
  assert.match(nextConfig, /source: "\/blog\/:slug", headers: publicEdgeCacheHeaders/);
  assert.match(cloudflareCache, /CLOUDFLARE_CACHE_PURGE_ENABLED/);
  assert.match(cloudflareCache, /prefixes/);
  assert.match(cloudflareCache, /AbortSignal\.timeout/);
  assert.match(articleApi, /purgeOptionalCloudflareCache/);
});

test("mantém referências abreviadas vinculadas e contabilizadas", async () => {
  const [editor, segments, articleHtml, referenceLinks, exporter, styles] = await Promise.all([
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("lib/footnote-segments.ts", root), "utf8"),
    readFile(new URL("lib/article-html.ts", root), "utf8"),
    readFile(new URL("lib/bibliographic-references.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(editor, /Adicionar referência abreviada/);
  assert.match(editor, /Ibid\. — mesma obra anterior/);
  assert.match(editor, /previousFootnoteReferenceId/);
  assert.match(editor, /Página, capítulo ou localização/);
  assert.match(editor, /op\. cit\. — obra citada anteriormente/);
  assert.match(editor, /Insira o sobrenome e a vírgula/);
  assert.match(segments, /presentation: "full" \| "ibid" \| "idem" \| "opcit"/);
  assert.match(segments, /abbreviatedReferenceText/);
  assert.match(articleHtml, /renderedReferenceSegment/);
  assert.match(referenceLinks, /abbreviatedReferenceText\(segment\.presentation/);
  assert.match(exporter, /segment\.presentation !== "full"/);
  assert.match(styles, /\.footnote-reference-warning/);
});

test("não contém dependências estruturais de edge ou serverless", async () => {
  const [packageJson, dockerfile, deployment, compose, startProduction] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
    readFile(new URL("docker-compose.yml", root), "utf8"),
    readFile(new URL("scripts/start-production.mjs", root), "utf8"),
  ]);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|drizzle-orm/);
  assert.match(dockerfile, /node:22-alpine/);
  assert.match(dockerfile, /pnpm-workspace\.yaml/);
  assert.match(dockerfile, /sharp-libvips-linuxmusl/);
  assert.match(dockerfile, /scripts\/start-production\.mjs/);
  assert.match(compose, /cap_drop:[\s\S]*- ALL/);
  assert.doesNotMatch(compose, /read_only:\s*true/);
  assert.match(startProduction, /NEXT_PUBLIC_SITE_URL/);
  assert.match(startProduction, /ADMIN_PASSWORD_HASH/);
  await assert.rejects(access(new URL("middleware.ts", root)));
  assert.match(deployment, /Certbot/);
  assert.match(deployment, /CONFIRM_RESTORE=RESTAURAR/);
});

test("mantém CI com build, PostgreSQL, migrações e validação Docker", async () => {
  const workflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /postgres:17-alpine/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm lint/);
  assert.match(workflow, /pnpm typecheck/);
  assert.match(workflow, /pnpm test/);
  assert.equal((workflow.match(/pnpm db:migrate/g) || []).length, 2);
  assert.match(workflow, /pnpm build/);
  assert.match(workflow, /pnpm audit --prod/);
  assert.match(workflow, /\.\/scripts\/check-production\.sh/);
});

test("oferece comentários encadeados com identificação do autor", async () => {
  const [component, api, migration, articlePage] = await Promise.all([
    readFile(new URL("components/ArticleComments.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/[slug]/comments/route.ts", root), "utf8"),
    readFile(new URL("migrations/003_tags_and_comments.sql", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
  ]);
  assert.match(component, /parentId/);
  assert.match(component, /Seu nome/);
  assert.match(component, /Responder/);
  assert.match(component, /adminName/);
  assert.match(api, /parent_id/);
  assert.match(api, /verifySession/);
  assert.match(migration, /article_comments/);
  assert.match(articlePage, /ArticleComments/);
});

test("compartilha artigos com endereço completo e opções acessíveis", async () => {
  const [articlePage, sharing] = await Promise.all([
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("components/ArticleShare.tsx", root), "utf8"),
  ]);
  assert.match(articlePage, /ArticleShare/);
  assert.match(sharing, /window\.location\.origin/);
  assert.match(sharing, /wa\.me/);
  assert.match(sharing, /linkedin\.com\/sharing\/share-offsite/);
  assert.match(sharing, /facebook\.com\/sharer\/sharer\.php/);
  assert.match(sharing, /mailto:/);
  assert.match(sharing, /navigator\.share/);
  assert.match(sharing, /Link copiado para compartilhar no Instagram/);
  assert.match(sharing, /navigator\.clipboard/);
});

test("inclui fórmulas, tags, pesquisa integral e sumário acadêmico", async () => {
  const [editor, articleHtml, articleList, articlePage, styles, repository] = await Promise.all([
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("lib/article-html.ts", root), "utf8"),
    readFile(new URL("components/ArticleList.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/repository.ts", root), "utf8"),
  ]);
  assert.match(editor, /Inserir fórmula LaTeX/);
  assert.match(editor, /ArticleFormula/);
  assert.match(editor, /editor-sticky-controls[\s\S]*editor-formula-settings[\s\S]*<EditorContent/);
  assert.doesNotMatch(editor, /insertTable/);
  assert.match(articleHtml, /katex\.renderToString/);
  assert.match(articleHtml, /Vídeo explicativo/);
  assert.match(articleHtml, /Comentários/);
  assert.match(articleList, /role="search"/);
  assert.match(repository, /a\.content_html ILIKE/);
  assert.match(repository, /br\.reference_text ILIKE/);
  assert.doesNotMatch(articleList, /category-filter/);
  assert.match(articlePage, /article-tags/);
  assert.match(styles, /tag-juridica/);
  assert.match(styles, /tag-contabil/);
  assert.match(styles, /figcaption[^}]*text-align:left/);
  assert.match(styles, /\.article-content ol \{ margin:1em 0/);
  assert.match(styles, /\.ProseMirror ol \{ margin:1em 0/);
  assert.match(styles, /\.rich-editor \.tiptap\.ProseMirror h2::before/);
  assert.match(styles, /counter\(editor-h2\)/);
  assert.match(articleHtml, /footnote-return/);
});

test("centraliza tags, modera comentários e renderiza fórmulas no editor", async () => {
  const [dashboard, tagsApi, commentsApi, editor, articlePage, articleList, styles, repository] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/tags/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/comments/route.ts", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("components/ArticleList.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/repository.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /Tags cadastradas/);
  assert.match(dashboard, /selectedTagSlugs/);
  assert.match(tagsApi, /export async function PATCH/);
  assert.match(tagsApi, /export async function DELETE/);
  assert.match(commentsApi, /UPDATE article_comments SET body/);
  assert.match(commentsApi, /export async function DELETE/);
  assert.match(dashboard, /Editar para moderação/);
  assert.match(dashboard, /Excluir/);
  assert.match(editor, /ReactNodeViewRenderer/);
  assert.match(editor, /formula-live-preview/);
  assert.match(articlePage, /blog\?tag=/);
  assert.match(articleList, /blogUrl\(\{ tag: tag\.slug/);
  assert.match(repository, /selected_tag\.slug/);
  assert.match(styles, /\.footnote-number \{ font-variant-numeric:tabular-nums/);
  assert.match(styles, /scroll-padding-top:132px/);
  assert.match(styles, /li\[data-level="3"\] \{ margin-left:1\.2em/);
  assert.match(styles, /tag-juridica[^}]*#eef4fc/);
  assert.match(styles, /tag-geral[^}]*#fff3e3/);
});

test("mantém publicações acadêmicas separadas do blog e com cadastro bibliográfico enxuto", async () => {
  const [page, dashboard, editor, api, uploadApi, migration, header, home] = await Promise.all([
    readFile(new URL("app/publicacoes/page.tsx", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/PublicationReferenceEditor.tsx", root), "utf8"),
    readFile(new URL("app/api/publications/route.ts", root), "utf8"),
    readFile(new URL("app/api/uploads/publications/route.ts", root), "utf8"),
    readFile(new URL("migrations/005_publications.sql", root), "utf8"),
    readFile(new URL("components/Header.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(header, /\["Publicações", "\/publicacoes"\]/);
  assert.match(home, /Textos recentes/);
  assert.match(page, /getPublishedPublications/);
  assert.match(page, /Baixar PDF/);
  assert.match(page, /Acessar publicação/);
  assert.doesNotMatch(page, /\/publicacoes\/\$\{/);
  assert.match(dashboard, /Referência completa/);
  assert.match(dashboard, /Data interna de publicação ou ordenação/);
  assert.doesNotMatch(dashboard, /Título da publicação/);
  assert.match(editor, /toggleBold/);
  assert.match(editor, /toggleItalic/);
  assert.match(editor, /toggleUnderline/);
  assert.match(editor, /setLink/);
  assert.match(editor, /superscript/);
  assert.match(editor, /subscript/);
  assert.match(editor, /Caractere especial/);
  assert.match(api, /sanitizeHtml/);
  assert.match(api, /ORDER BY publication_date DESC/);
  assert.match(uploadApi, /MAX_PDF_SIZE/);
  assert.match(uploadApi, /%PDF-/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS publications/);
  assert.match(migration, /CHECK \(status IN \('draft', 'published'\)\)/);
});

test("mantém o limite de PDF coerente entre aplicação, painel e Nginx", async () => {
  const [uploadApi, dashboard, nginx, deployment] = await Promise.all([
    readFile(new URL("app/api/uploads/publications/route.ts", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("nginx/academia.conf.example", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
  ]);

  const applicationLimit = uploadApi.match(/MAX_PDF_SIZE\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
  const proxyLimit = nginx.match(/client_max_body_size\s+(\d+)m/);

  assert.equal(Number(applicationLimit?.[1]), 20);
  assert.equal(Number(proxyLimit?.[1]), 21);
  assert.ok(Number(proxyLimit?.[1]) > Number(applicationLimit?.[1]));
  assert.match(uploadApi, /upload\.size === 0 \|\| upload\.size > MAX_PDF_SIZE/);
  assert.match(uploadApi, /upload\.type !== "application\/pdf"/);
  assert.match(uploadApi, /%PDF-/);
  assert.match(dashboard, /PDF de até 20 MB/);
  assert.match(deployment, /limite efetivo do arquivo PDF em \*\*20 MiB\*\*/);
});

test("seleciona tags por pesquisa e preserva a ordem de inserção", async () => {
  const [dashboard, articleApi, repository, migration, styles] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("lib/repository.ts", root), "utf8"),
    readFile(new URL("migrations/006_article_tag_order.sql", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(dashboard, /Adicionar tag/);
  assert.match(dashboard, /Pesquisar tags/);
  assert.match(dashboard, /setSelectedTagSlugs\(\(current\) => \[\.\.\.current, tag\.slug\]\)/);
  assert.match(dashboard, /selected-article-tags/);
  assert.match(articleApi, /tagSlugs\.entries\(\)/);
  assert.match(articleApi, /display_order/);
  assert.match(repository, /ORDER BY at\.display_order/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS display_order/);
  assert.match(styles, /tag-picker-popover/);
  assert.match(styles, /max-height:240px/);
});

test("ordena o cabeçalho e permite remover fórmulas LaTeX", async () => {
  const [header, editor] = await Promise.all([
    readFile(new URL("components/Header.tsx", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
  ]);
  const expectedOrder = [
    '["Início", "/"]',
    '["Blog", "/blog"]',
    '["Cursos", "/cursos"]',
    '["Publicações", "/publicacoes"]',
    '["Canais", "/canais"]',
    '["A Academia", "/sobre"]',
    '["Contato", "/contato"]',
  ];
  let previous = -1;
  for (const item of expectedOrder) {
    const position = header.indexOf(item);
    assert.ok(position > previous, `ordem incorreta para ${item}`);
    previous = position;
  }
  assert.match(editor, /Remover fórmula/);
  assert.match(editor, /removeSelectedFormula/);
  assert.match(editor, /Backspace:.*deleteSelection/);
  assert.match(editor, /Delete:.*deleteSelection/);
});

test("reúne YouTube e Instagram na página de canais e preserva o endereço antigo", async () => {
  const [channels, youtube, footer, sitemap, contact, styles, env] = await Promise.all([
    readFile(new URL("app/canais/page.tsx", root), "utf8"),
    readFile(new URL("app/youtube/page.tsx", root), "utf8"),
    readFile(new URL("components/Footer.tsx", root), "utf8"),
    readFile(new URL("app/sitemap.ts", root), "utf8"),
    readFile(new URL("app/contato/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);
  assert.ok(channels.indexOf('name: "YouTube"') < channels.indexOf('name: "Instagram"'));
  assert.equal((channels.match(/@academiajuridicocontabil/g) || []).length, 3);
  assert.match(channels, /youtube\.com\/@academiajuridicocontabil/);
  assert.match(channels, /instagram\.com\/academiajuridicocontabil/);
  assert.match(youtube, /permanentRedirect\("\/canais"\)/);
  assert.match(footer, /href="\/canais">Canais/);
  assert.match(sitemap, /"\/canais"/);
  assert.doesNotMatch(sitemap, /"\/youtube"/);
  assert.doesNotMatch(channels, /channels-hero/);
  assert.doesNotMatch(styles, /\.channels-hero/);
  assert.doesNotMatch(contact, /contato@academiajuridicocontabil\.com\.br/);
  assert.doesNotMatch(contact, /Endereço em processo de ativação/);
  assert.doesNotMatch(contact, /configuração do serviço de e-mail/);
  assert.match(env, /CONTACT_TO=contato@academiajuridicocontabil\.com\.br/);
});

test("apresenta a Academia e integra o perfil do fundador sem criar nova aba", async () => {
  const [about, author, footer, sitemap] = await Promise.all([
    readFile(new URL("app/sobre/page.tsx", root), "utf8"),
    readFile(new URL("app/autor/page.tsx", root), "utf8"),
    readFile(new URL("components/Footer.tsx", root), "utf8"),
    readFile(new URL("app/sitemap.ts", root), "utf8"),
  ]);
  assert.match(about, /Por que Academia Jurídico-Contábil\?/);
  assert.match(about, /Essa distância produz lacunas de ambos os lados/);
  assert.match(about, /tanto aos profissionais do Direito que necessitam compreender a Contabilidade quanto aos contadores/);
  assert.match(about, /ensinar Contabilidade para juristas e Direito para contadores/);
  assert.match(about, /<strong>Direito<\/strong>/);
  assert.match(about, /ponte entre o Direito e a Ciência Contábil/);
  assert.match(about, /className="academy-mission"/);
  assert.match(about, /Lucas Faillace Castelo Branco/);
  assert.match(about, /lucas-faillace-castelo-branco\.jpg/);
  assert.match(about, /Especialista em Direito Tributário/);
  assert.match(about, /Instituto Brasileiro de Estudos Tributários \(IBET\)/);
  assert.match(about, /Direito Empresarial pela Fundação Getulio Vargas \(FGV\)/);
  assert.match(about, /instagram\.com\/lucas\.faillace/);
  assert.match(about, /@lucas\.faillace/);
  assert.match(about, /linkedin\.com\/in\/lucas-faillace-castelo-branco-3a476328/);
  assert.match(about, /lattes\.cnpq\.br\/8207128322459263/);
  assert.match(author, /permanentRedirect\("\/sobre#fundador"\)/);
  assert.doesNotMatch(footer, /Sobre o autor/);
  assert.doesNotMatch(sitemap, /"\/autor"/);
});

test("insere, edita e remove links relativos para artigos publicados", async () => {
  const [dashboard, editor, articleApi] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /article\.status === "published"/);
  assert.match(editor, /Pesquisar pelo título/);
  assert.match(editor, /href: `\/blog\/\$\{article\.slug\}`/);
  assert.match(editor, /target: "_blank"/);
  assert.match(editor, /rel: "noopener noreferrer"/);
  assert.match(editor, /Editar link interno/);
  assert.match(editor, /Remover link/);
  assert.match(editor, /removeActiveInternalLink/);
  assert.match(editor, /selectionHasLink/);
  assert.match(editor, /unsetLink\(\)/);
  assert.match(articleApi, /"target", "rel"/);
});

test("cadastra múltiplas autorias por artigo e preserva a ordem pública", async () => {
  const [dashboard, articleApi, repository, articlePage, migration] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("lib/repository.ts", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("migrations/007_article_authors.sql", root), "utf8"),
  ]);
  assert.match(dashboard, /Autoria do artigo/);
  assert.match(dashboard, /Adicionar outra autoria/);
  assert.match(dashboard, /setAuthors/);
  assert.match(articleApi, /authors: z\.array/);
  assert.match(articleApi, /author_names/);
  assert.match(repository, /row\.author_names/);
  assert.match(articlePage, /authorNames\.map/);
  assert.match(articlePage, /formatAuthorNames/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS author_names jsonb/);
  assert.match(migration, /jsonb_build_array\(author_name\)/);
});

test("insere, edita, remove e reconhece links nas notas de rodapé", async () => {
  const [editor, articleApi] = await Promise.all([
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
  ]);
  assert.match(editor, /normalizeFootnoteUrl/);
  assert.match(editor, /autolink: true/);
  assert.match(editor, /linkOnPaste: true/);
  assert.match(editor, /function openInternalLinkComposer/);
  assert.match(editor, /function saveInternalLink/);
  assert.match(editor, /Link externo/);
  assert.match(editor, /Link interno/);
  assert.match(editor, /href: `\/blog\/\$\{article\.slug\}`/);
  assert.match(editor, /publishedArticles=\{publishedArticles\}/);
  assert.match(editor, /Inserir link/);
  assert.match(editor, /Editar link/);
  assert.match(editor, /Remover link/);
  assert.match(editor, /noopener noreferrer/);
  assert.match(editor, /unsetLink\(\)/);
  assert.match(articleApi, /a: \["href", "id", "aria-label", "class", "target", "rel"\]/);
});

test("mantém referências únicas no painel e admite várias obras em uma mesma nota", async () => {
  const [migration, formattingMigration, multipleMigration, referenceApi, articleApi, editor, referenceEditor, dashboard, articleHtml, store, segments] = await Promise.all([
    readFile(new URL("migrations/009_bibliographic_references.sql", root), "utf8"),
    readFile(new URL("migrations/010_bibliographic_reference_formatting.sql", root), "utf8"),
    readFile(new URL("migrations/011_multiple_references_per_footnote.sql", root), "utf8"),
    readFile(new URL("app/api/references/route.ts", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("components/PublicationReferenceEditor.tsx", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("lib/article-html.ts", root), "utf8"),
    readFile(new URL("lib/reference-store.ts", root), "utf8"),
    readFile(new URL("lib/footnote-segments.ts", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS bibliographic_references/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS article_footnote_references/);
  assert.match(migration, /ON DELETE RESTRICT/);
  assert.match(migration, /UNIQUE/);
  assert.match(formattingMigration, /reference_html text/);
  assert.match(multipleMigration, /occurrence_index/);
  assert.match(multipleMigration, /PRIMARY KEY \(article_id, footnote_id, occurrence_index\)/);
  assert.match(referenceApi, /verifySession/);
  assert.match(referenceApi, /sanitizeBibliographicReferenceHtml/);
  assert.match(referenceApi, /referenceTextFromHtml/);
  assert.match(referenceApi, /reference_html/);
  assert.match(referenceApi, /similar_reference/);
  assert.match(referenceApi, /reference_in_use/);
  assert.match(referenceApi, /ORDER BY lower\(br\.reference_text\)/);
  assert.match(articleApi, /syncFootnoteReferences/);
  assert.match(articleApi, /data-footnote-reference-id/);
  assert.match(articleApi, /data-footnote-segments/);
  assert.match(editor, /Monte a nota na ordem em que ela será lida/);
  assert.match(editor, /Adicionar texto/);
  assert.match(editor, /Adicionar referência/);
  assert.match(editor, /Prévia da nota/);
  assert.match(editor, /Pesquisar referência cadastrada/);
  assert.match(editor, /Cadastrar nova referência/);
  assert.match(editor, /PublicationReferenceEditor/);
  assert.match(editor, /footnote-bibliographic-reference/);
  assert.match(segments, /legacyFootnoteSegments/);
  assert.match(segments, /encodeFootnoteSegments/);
  assert.match(segments, /replacesTerminalReferencePeriod/);
  assert.match(segments, /removeTerminalReferencePeriod/);
  assert.match(editor, /replacesTerminalReferencePeriod/);
  assert.match(articleHtml, /replacesTerminalReferencePeriod/);
  assert.doesNotMatch(editor, /<h2>Referências<\/h2>/);
  assert.match(referenceEditor, /toggleBold/);
  assert.match(referenceEditor, /toggleItalic/);
  assert.match(referenceEditor, /toggleUnderline/);
  assert.match(referenceEditor, /setLink/);
  assert.match(referenceEditor, /noopener noreferrer/);
  assert.match(referenceEditor, /superscript/);
  assert.match(referenceEditor, /subscript/);
  assert.match(dashboard, /\["references", "Referências", FileText\]/);
  assert.match(dashboard, /Pesquisar autor, título ou expressão/);
  assert.match(dashboard, /não pode ser excluída porque está em uso/);
  assert.match(articleHtml, /renderFootnotes/);
  assert.match(articleHtml, /footnote-bibliographic-reference/);
  assert.doesNotMatch(articleHtml, /<h2>Referências<\/h2>/);
  assert.match(store, /similarPreviewReferences/);
});

test("mantém fichamentos privados vinculados às referências bibliográficas", async () => {
  const [migration, topicsMigration, simplifiedKindsMigration, linksMigration, structuredContentMigration, route, topicsRoute, dashboard, editor, styles, referencesRoute, exportRoute, exporter] = await Promise.all([
    readFile(new URL("migrations/012_reference_fichamentos.sql", root), "utf8"),
    readFile(new URL("migrations/013_reference_fichamento_topics.sql", root), "utf8"),
    readFile(new URL("migrations/014_simplify_fichamento_kind.sql", root), "utf8"),
    readFile(new URL("migrations/015_reference_fichamento_links.sql", root), "utf8"),
    readFile(new URL("migrations/016_fichamento_literal_quote_and_paraphrase.sql", root), "utf8"),
    readFile(new URL("app/api/reference-fichamentos/route.ts", root), "utf8"),
    readFile(new URL("app/api/fichamento-topics/route.ts", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/api/references/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/references/export-word-with-fichamentos/route.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reference_fichamentos/);
  assert.match(migration, /REFERENCES bibliographic_references\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /direta.*indireta.*anotacao/s);
  assert.match(route, /verifySession/);
  assert.match(route, /createPreviewFichamento/);
  assert.match(route, /INSERT INTO reference_fichamentos/);
  assert.match(route, /UPDATE reference_fichamentos/);
  assert.match(route, /DELETE FROM reference_fichamentos/);
  assert.match(topicsMigration, /CREATE TABLE IF NOT EXISTS reference_fichamento_topics/);
  assert.match(topicsMigration, /CREATE TABLE IF NOT EXISTS reference_fichamento_topic_links/);
  assert.match(simplifiedKindsMigration, /SET kind='citacao'/);
  assert.match(simplifiedKindsMigration, /CHECK \(kind IN \('citacao', 'anotacao'\)\)/);
  assert.match(linksMigration, /CREATE TABLE IF NOT EXISTS reference_fichamento_links/);
  assert.match(linksMigration, /source_fichamento_id <> target_fichamento_id/);
  assert.match(structuredContentMigration, /literal_quote/);
  assert.match(structuredContentMigration, /paraphrase/);
  assert.match(topicsRoute, /normalizeFichamentoTopic/);
  assert.match(topicsRoute, /verifySession/);
  assert.match(topicsRoute, /export async function PATCH/);
  assert.match(topicsRoute, /export async function DELETE/);
  assert.match(topicsRoute, /reference_fichamento_topic_links/);
  assert.match(topicsRoute, /validReferenceIds/);
  assert.match(topicsRoute, /visibleFichamentos/);
  assert.match(topicsRoute, /removedUsageCount/);
  assert.match(route, /reference_fichamento_topic_links/);
  assert.match(route, /relatedFichamentoIds/);
  assert.match(route, /reference_fichamento_links/);
  assert.match(dashboard, /Fichamento/);
  assert.match(dashboard, /Citação literal/);
  assert.match(dashboard, /Síntese ou paráfrase/);
  assert.doesNotMatch(dashboard, /Citação direta/);
  assert.doesNotMatch(dashboard, /Citação indireta/);
  assert.match(dashboard, /Observação pessoal/);
  assert.match(dashboard, /Remissões para outros fichamentos/);
  assert.match(dashboard, /Referenciado por/);
  assert.match(dashboard, /formatFichamentoPersonalNote/);
  assert.match(dashboard, /Pesquisar no fichamento/);
  assert.match(dashboard, /copyFichamento/);
  assert.match(dashboard, /Copiar citação literal/);
  assert.match(dashboard, /Copiar paráfrase/);
  assert.match(editor, /Consultar fichamentos desta obra/);
  assert.match(editor, /Pesquisar nos fichamentos/);
  assert.match(editor, /Filtrar fichamentos por tema/);
  assert.match(editor, /Inserir citação na nota/);
  assert.match(editor, /Inserir paráfrase na nota/);
  assert.match(editor, /Copiar citação literal/);
  assert.match(editor, /Copiar paráfrase/);
  assert.match(styles, /\.footnote-fichamentos/);
  assert.match(dashboard, /Busca por temas/);
  assert.match(dashboard, /Pesquisar nos fichamentos/);
  assert.match(dashboard, /referenceFichamentoQuery/);
  assert.match(dashboard, /onFocus=\{\(\) => void loadReferences\(\)\}/);
  assert.match(dashboard, /Nenhum fichamento salvo contém/);
  assert.match(dashboard, /esse registro ainda precisa ser salvo/);
  assert.ok(dashboard.indexOf('id="reference-form-panel"') < dashboard.indexOf("<span>Busca por temas</span>"));
  assert.ok(dashboard.indexOf("<span>Busca por temas</span>") < dashboard.indexOf("<span>Referências cadastradas</span>"));
  assert.match(dashboard, /Limpar temas/);
  assert.match(dashboard, /Este tema não possui fichamentos disponíveis/);
  assert.match(dashboard, /Gerenciar temas/);
  assert.match(dashboard, /Criar tema/);
  assert.match(dashboard, /deleteManagedFichamentoTopic/);
  assert.match(dashboard, /sem excluir seu conteúdo/);
  assert.match(dashboard, /selectedFichamentoFilterTopicIds/);
  assert.match(dashboard, /\.every\(\(topicId\)/);
  assert.match(dashboard, /reference-fichamento-editor/);
  assert.match(dashboard, /fichamentoFormOpen/);
  assert.match(dashboard, /name="reference-main-panels"/);
  assert.match(dashboard, /id="references-list-panel"/);
  assert.match(dashboard, /referencesPanel\.open = true/);
  assert.match(dashboard, /editing-state-badge/);
  assert.match(dashboard, /Pesquisar ou criar tema/);
  assert.match(dashboard, /Vocabulário privado e independente das tags públicas do Blog/);
  assert.match(styles, /\.reference-fichamento-panel/);
  assert.match(styles, /\.reference-panel>summary/);
  assert.match(styles, /\.reference-fichamento-search-feedback/);
  assert.match(styles, /\.reference-topic-management-list/);
  assert.match(referencesRoute, /reference_has_fichamento/);
  assert.match(referencesRoute, /fichamentoSearchText/);
  assert.match(referencesRoute, /string_agg/);
  assert.match(exportRoute, /verifySession/);
  assert.match(exportRoute, /generateReferencesWithFichamentosDocx/);
  assert.match(exporter, /Referências e fichamentos/);
  assert.match(dashboard, /Referências bibliográficas/);
  assert.match(dashboard, /Referências com fichamentos/);
});

test("exporta artigos para Word exclusivamente pelo painel autenticado", async () => {
  const [dashboard, route, allRoute, exportData, exporter, publicPage, fallback] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/admin/articles/[slug]/export-word/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/articles/export-word/route.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export-data.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("lib/fallback-article-html.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /Exportar para Word/);
  assert.match(dashboard, /\/api\/admin\/articles\/\$\{encodeURIComponent\(article\.slug\)\}\/export-word/);
  assert.match(route, /verifySession/);
  assert.match(route, /Não autorizado/);
  assert.match(route, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(route, /private, no-store/);
  assert.match(allRoute, /verifySession/);
  assert.match(allRoute, /listArticlesForWordExport/);
  assert.match(allRoute, /zipSync/);
  assert.match(allRoute, /application\/zip/);
  assert.match(dashboard, /Exportar todos/);
  assert.match(dashboard, /\/api\/admin\/articles\/export-word/);
  assert.match(exporter, /w:footnoteReference/);
  assert.match(exporter, /data-article-formula/);
  assert.match(exporter, /data-article-image/);
  assert.match(exporter, /w:tblLayout w:type="fixed"/);
  assert.match(exporter, /article\.summary/);
  assert.match(exporter, /article\.youtubeUrl/);
  assert.match(exporter, /article\.bibliographicReferences/);
  assert.match(exportData, /extractFootnoteReferenceLinks/);
  assert.match(exportData, /fallbackArticleHtml/);
  assert.match(fallback, /Exemplo de quadro comparativo provisório/);
  assert.match(exporter, /wordExportFilename/);
  assert.doesNotMatch(publicPage, /Exportar para Word/);
});

test("exporta todas as referências para Word e mantém compactas as ações dos artigos", async () => {
  const [dashboard, route, exporter, styles] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/admin/references/export-word/route.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(dashboard, /Exportar para Word/);
  assert.match(dashboard, /Referências bibliográficas/);
  assert.match(dashboard, /\/api\/admin\/references\/export-word/);
  assert.match(dashboard, /articles-admin-table/);
  assert.match(dashboard, /Pesquisar por título ou autoria/);
  assert.match(dashboard, /Últimos 30 dias/);
  assert.match(dashboard, /Limpar filtros/);
  assert.match(dashboard, /compact-table-action/);
  assert.match(dashboard, /aria-label=\{`Editar artigo:/);
  assert.match(dashboard, /aria-label=\{`Exportar para Word:/);
  assert.match(dashboard, /aria-label=\{`Excluir artigo:/);
  assert.match(route, /verifySession/);
  assert.match(route, /Não autorizado/);
  assert.match(route, /ORDER BY lower\(reference_text\)/);
  assert.match(route, /private, no-store/);
  assert.match(exporter, /generateReferencesDocx/);
  assert.match(exporter, /Bibliography/);
  assert.match(exporter, /w:hanging="720"/);
  assert.match(exporter, /localeCompare\(right\.referenceText, "pt-BR"\)/);
  assert.match(styles, /\.article-row-actions \{ flex-wrap:nowrap; \}/);
  assert.match(styles, /\.compact-table-action \{ width:34px; height:34px;/);
});

test("permite excluir artigos autenticados e mantém a exclusão na prévia", async () => {
  const [dashboard, articleApi, previewStore, commentsStore] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("lib/preview-store.ts", root), "utf8"),
    readFile(new URL("lib/comment-store.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /deleteArticle/);
  assert.match(dashboard, /Excluir permanentemente o artigo/);
  assert.match(dashboard, /danger-action/);
  assert.match(articleApi, /export async function DELETE/);
  assert.match(articleApi, /DELETE FROM articles WHERE slug=\$1 RETURNING slug/);
  assert.match(articleApi, /deletePreviewCommentsForArticle/);
  assert.match(previewStore, /previewDeletedArticlesFilename/);
  assert.match(previewStore, /deleteStoredArticle/);
  assert.match(commentsStore, /deletePreviewCommentsForArticle/);
});

test("aplica a marca branca sem fundo no rodapé e no painel administrativo", async () => {
  const [footer, dashboard, styles] = await Promise.all([
    readFile(new URL("components/Footer.tsx", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(footer, /logo-academia-transparente\.png/);
  assert.match(dashboard, /admin-sidebar-logo/);
  assert.match(dashboard, /logo-academia-transparente\.png/);
  assert.match(styles, /\.footer-logo[^}]*filter:brightness\(0\) invert\(1\)/);
  assert.match(styles, /\.admin-sidebar-logo[^}]*filter:brightness\(0\) invert\(1\)/);
  assert.doesNotMatch(styles, /\.footer-logo[^}]*background:#fff/);
});

test("oferece atalho local para a prévia sem enfraquecer a autenticação de produção", async () => {
  const [loginPage, route, previewFiles, articleStore, referenceStore, packageJson, gitignore] = await Promise.all([
    readFile(new URL("app/admin/login/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/local-preview/route.ts", root), "utf8"),
    readFile(new URL("lib/preview-file-store.ts", root), "utf8"),
    readFile(new URL("lib/preview-store.ts", root), "utf8"),
    readFile(new URL("lib/reference-store.ts", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL(".gitignore", root), "utf8"),
  ]);
  assert.match(loginPage, /Acessar painel nesta prévia/);
  assert.match(loginPage, /local-preview/);
  assert.match(route, /NODE_ENV !== "production"/);
  assert.match(route, /127\.0\.0\.1/);
  assert.match(route, /createSession/);
  assert.match(route, /Não encontrado/);
  assert.match(previewFiles, /path\.join\(process\.cwd\(\), "storage", "preview"\)/);
  assert.match(previewFiles, /PREVIEW_DATA_DIR/);
  assert.match(previewFiles, /readPreviewDataFile/);
  assert.match(articleStore, /previewArticlesFilename = "articles\.json"/);
  assert.match(referenceStore, /previewReferencesFilename = "bibliographic-references\.json"/);
  assert.match(packageJson, /"preview:local": "CONTENT_FALLBACK_MODE=file next dev -p 3022"/);
  assert.match(gitignore, /\/storage\/preview\/\*/);
});

test("registra visualizações privadas por data e apresenta estatísticas somente no painel", async () => {
  const [migration, viewApi, statisticsApi, statistics, dashboard, articlePage, tracker, consent, layout, env, compose] = await Promise.all([
    readFile(new URL("migrations/008_article_views.sql", root), "utf8"),
    readFile(new URL("app/api/articles/[slug]/views/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/statistics/route.ts", root), "utf8"),
    readFile(new URL("components/StatisticsDashboard.tsx", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("components/ArticleViewTracker.tsx", root), "utf8"),
    readFile(new URL("components/AnalyticsConsent.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("docker-compose.yml", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS article_views/);
  assert.match(migration, /viewed_on date/);
  assert.match(migration, /dedupe_key char\(64\)/);
  assert.match(viewApi, /createHmac/);
  assert.match(viewApi, /30 \* 60 \* 1000/);
  assert.match(viewApi, /verifySession/);
  assert.match(viewApi, /botPattern/);
  assert.doesNotMatch(viewApi, /x-forwarded-for|request\.ip/);
  assert.match(statisticsApi, /verifySession/);
  assert.match(statisticsApi, /buildStatistics/);
  assert.match(statistics, /Total geral/);
  assert.match(statistics, /Últimos 30 dias/);
  assert.match(statistics, /Artigos mais acessados/);
  assert.match(statistics, /Artigos menos acessados/);
  assert.match(statistics, /Estatísticas por artigo/);
  assert.match(statistics, /Média diária/);
  assert.match(dashboard, /\["statistics", "Estatísticas", BarChart3\]/);
  assert.match(articlePage, /ArticleViewTracker/);
  assert.doesNotMatch(articlePage, /totalViews|views30|views7/);
  assert.match(tracker, /x-analytics-consent/);
  assert.match(consent, /Google Analytics/);
  assert.match(consent, /Aceitar estatísticas/);
  assert.match(consent, /allow_google_signals: false/);
  assert.match(layout, /AnalyticsConsent/);
  assert.match(env, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  assert.match(env, /ANALYTICS_HASH_SECRET/);
  assert.match(compose, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  assert.match(compose, /ANALYTICS_HASH_SECRET/);
});

test("oferece prévia privada de rascunhos no mesmo layout público", async () => {
  const [dashboard, adminPage, previewPage, articleView, repository, previewStore] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/preview/[slug]/page.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("lib/repository.ts", root), "utf8"),
    readFile(new URL("lib/preview-store.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /Prévia privada/);
  assert.match(dashboard, /\/admin\/preview\//);
  assert.match(dashboard, /initialArticleSlug/);
  assert.match(dashboard, /history\.replaceState/);
  assert.match(adminPage, /searchParams/);
  assert.match(adminPage, /initialArticleSlug/);
  assert.match(dashboard, /Mover para rascunho/);
  assert.match(dashboard, /Publicar artigo/);
  assert.match(previewPage, /verifySession/);
  assert.match(previewPage, /robots: \{ index: false, follow: false, nocache: true \}/);
  assert.match(previewPage, /dynamic = "force-dynamic"/);
  assert.match(previewPage, /ArticlePageView article=\{article\} preview/);
  assert.match(articleView, /!preview && <ArticleViewTracker/);
  assert.match(articleView, /A área de comentários será habilitada/);
  assert.match(articleView, /\/admin\?edit=/);
  assert.match(repository, /getArticleForAdminPreview/);
  assert.match(previewStore, /getPreviewArticle/);
});

test("mantém o sumário logo após o resumo e com largura contida", async () => {
  const [articleView, styles] = await Promise.all([
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(articleView, /article-abstract[\s\S]*ArticleRichContent html=\{preparedContent\}/);
  assert.doesNotMatch(articleView, /article-toc-column|articleBody/);
  assert.match(styles, /\.article-inline-toc\s*\{[^}]*width:fit-content[^}]*max-width:100%/);
  assert.match(styles, /\.article-content blockquote p \{ margin:0; \}/);
  assert.doesNotMatch(styles, /\.article-inline-toc\s*\{[^}]*min-width/);
});

test("organiza a edição do artigo em painéis recolhíveis sem mover as ações editoriais", async () => {
  const [dashboard, editor, styles, footnoteSegments] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("lib/footnote-segments.ts", root), "utf8"),
  ]);
  assert.match(dashboard, /editor-actions[\s\S]*Prévia privada[\s\S]*Mover para rascunho[\s\S]*Atualizar publicado[\s\S]*editor-accordion/);
  assert.match(dashboard, /<details className="editor-section" name="article-editor-sections">[\s\S]*Identificação e autoria/);
  assert.match(dashboard, /<summary><span>Resumo<\/span>/);
  assert.match(dashboard, /<summary><span>Tags<\/span>/);
  assert.match(dashboard, /<summary><span>Vídeo explicativo<\/span>/);
  assert.match(dashboard, /<summary><span>Conteúdo do artigo<\/span>/);
  assert.match(editor, /className="editor-footnotes"/);
  assert.match(editor, /setNotesOpen\(true\)/);
  assert.match(editor, /Há nota incompleta/);
  assert.match(editor, /className="footnote-item"/);
  assert.match(editor, /footnote-segment is-\$\{segment\.type\}/);
  assert.match(editor, /open=\{openFootnoteIds\.has\(item\.id\)\}/);
  assert.match(editor, /referência\$\{referenceCount === 1 \? "" : "s"\}/);
  assert.match(editor, /shortenedFootnotePreview/);
  assert.match(editor, /Incompleta/);
  assert.match(editor, /segments: \[\]/);
  assert.match(footnoteSegments, /if \(Array\.isArray\(parsed\)\) return validSegments\(parsed\)/);
  assert.match(editor, /\+ Adicionar texto/);
  assert.match(editor, /\+ Adicionar referência/);
  assert.doesNotMatch(editor, /Use os intertítulos de níveis 1 e 2 sem digitar números/);
  assert.doesNotMatch(dashboard, /Comece a escrever o artigo/);
  assert.match(dashboard, /<details>[\s\S]*reference\.usageCount/);
  assert.match(dashboard, /editArticle\(article, usage\.footnoteId\)/);
  assert.match(editor, /focusFootnote/);
  assert.match(editor, /editor-footnote-\$\{focusFootnote\.id\}/);
  assert.match(dashboard, /draftAutosaveDelay = 1800/);
  assert.match(dashboard, /editingStatus !== "draft"/);
  assert.match(dashboard, /title\.trim\(\)\.length < 3/);
  assert.match(dashboard, /save\("draft", \{ automatic: true \}\)/);
  assert.match(dashboard, /Rascunho salvo automaticamente/);
  assert.match(dashboard, /Não foi possível salvar automaticamente/);
  assert.match(styles, /\.editor-section>summary/);
  assert.match(styles, /\.draft-autosave-status/);
  assert.match(styles, /\.footnote-item>summary/);
  assert.match(styles, /\.footnote-segment\.is-reference/);
  assert.match(styles, /\.editor-footnotes ol \{ display:grid; gap:14px/);
  assert.match(styles, /\.footnote-item\[open\] \{ border-left-color:var\(--blue-700\)/);
});

test("classifica os artigos por tags na listagem e mantém a página inicial enxuta", async () => {
  const [dashboard, articlePage, articleList, home, exporter] = await Promise.all([
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("components/ArticlePageView.tsx", root), "utf8"),
    readFile(new URL("components/ArticleList.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /<th>Categoria<\/th>/);
  assert.doesNotMatch(dashboard, /<label>Categoria/);
  assert.match(articlePage, /<p className="eyebrow">Artigo<\/p>/);
  assert.match(articleList, /article\.tags\.map/);
  assert.match(articleList, /blogUrl\(\{ tag: tag\.slug/);
  assert.doesNotMatch(articleList, /<p className="eyebrow">Artigo<\/p>/);
  assert.doesNotMatch(articleList, /article\.category/);
  assert.doesNotMatch(home, /article\.tags\.map/);
  assert.doesNotMatch(home, /publication-meta"><span>Artigo<\/span>/);
  assert.doesNotMatch(exporter, /Área:/);
  assert.match(exporter, /Tags: \$\{tags\}/);
});

test("normaliza cada upload em somente duas versões WebP proporcionais", async () => {
  const [uploadRoute, imageProcessing, mediaRoute, editor, articleRoute, exporter] = await Promise.all([
    readFile(new URL("app/api/uploads/images/route.ts", root), "utf8"),
    readFile(new URL("lib/image-processing.ts", root), "utf8"),
    readFile(new URL("app/media/[key]/route.ts", root), "utf8"),
    readFile(new URL("components/RichEditor.tsx", root), "utf8"),
    readFile(new URL("app/api/articles/route.ts", root), "utf8"),
    readFile(new URL("lib/article-word-export.ts", root), "utf8"),
  ]);
  assert.match(uploadRoute, /processArticleImage/);
  assert.match(imageProcessing, /desktop: \{ width: 1600, height: 2000 \}/);
  assert.match(imageProcessing, /mobile: \{ width: 800, height: 1200 \}/);
  assert.equal((uploadRoute.match(/saveOriginal\("imagem-/g) || []).length, 2);
  assert.match(imageProcessing, /withoutEnlargement: true/);
  assert.match(imageProcessing, /\.webp\(webpOptions\)/);
  assert.doesNotMatch(uploadRoute, /saveOriginal\(`imagem\.\$\{/);
  assert.match(mediaRoute, /desktop\|mobile/);
  assert.match(editor, /\["picture"/);
  assert.match(editor, /mobileSrc: uploaded\.mobileUrl/);
  assert.match(articleRoute, /"picture", "source"/);
  assert.match(exporter, /findAll\(element\.children,[\s\S]*node\.name === "img"/);
});

test("remove uploads obsoletos somente após desvinculação e oferece reconciliação segura", async () => {
  const [storage, publications, docxImport, reconciliation, deployment, dockerfile] = await Promise.all([
    readFile(new URL("lib/storage.ts", root), "utf8"),
    readFile(new URL("app/api/publications/route.ts", root), "utf8"),
    readFile(new URL("app/api/import-docx/route.ts", root), "utf8"),
    readFile(new URL("scripts/reconcile-uploads.mjs", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
  ]);

  assert.match(storage, /deleteOriginal\(key: string\): Promise<boolean>/);
  assert.match(storage, /path\.basename\(key\) !== key/);
  assert.match(storage, /await unlink\(this\.originalPath\(key\)\)/);
  assert.match(storage, /code === "ENOENT"/);
  assert.match(publications, /SELECT 1 FROM publications WHERE pdf_key=\$1 LIMIT 1/);
  assert.match(publications, /previous\.previous_pdf_key/);
  assert.match(publications, /DELETE FROM publications WHERE id=\$1 RETURNING pdf_key/);
  assert.match(publications, /removePreviewPdfIfUnused/);
  assert.doesNotMatch(docxImport, /saveOriginal/);
  assert.doesNotMatch(docxImport, /originalKey/);
  assert.match(reconciliation, /process\.argv\.includes\("--apply"\)/);
  assert.match(reconciliation, /minimumAgeHours/);
  assert.match(reconciliation, /SELECT content_html FROM articles/);
  assert.match(reconciliation, /SELECT pdf_key FROM publications/);
  assert.match(reconciliation, /if \(!apply\)/);
  assert.match(reconciliation, /await fs\.unlink\(candidate\.path\)/);
  assert.match(deployment, /nunca remove nada sem `--apply`/);
  assert.match(dockerfile, /COPY --from=builder --chown=nextjs:nodejs \/app\/scripts \.\/scripts/);
});

test("pagina e pesquisa o Blog no servidor sem carregar todos os artigos", async () => {
  const [repository, blogPage, articleList, home] = await Promise.all([
    readFile(new URL("lib/repository.ts", root), "utf8"),
    readFile(new URL("app/blog/page.tsx", root), "utf8"),
    readFile(new URL("components/ArticleList.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(repository, /getPublishedArticlePage/);
  assert.match(repository, /LIMIT \$\$\{values\.length \+ 1\} OFFSET \$\$\{values\.length \+ 2\}/);
  assert.match(repository, /br\.reference_text ILIKE/);
  assert.match(repository, /a\.content_html ILIKE/);
  assert.match(repository, /a\.slug=\$1 LIMIT 1/);
  assert.doesNotMatch(repository, /getPublishedArticle\(slug: string\)[\s\S]{0,160}getPublishedArticles/);
  assert.match(blogPage, /pageSize: 12/);
  assert.match(articleList, /method="get" role="search"/);
  assert.match(articleList, /rel="prev"/);
  assert.match(articleList, /rel="next"/);
  assert.match(home, /getRecentPublishedArticles\(3\)/);
});

test("endurece o Nginx e documenta a Cloudflare gratuita como opcional", async () => {
  const [nginx, deployment, env, packageJson] = await Promise.all([
    readFile(new URL("nginx/academia.conf.example", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.match(nginx, /gzip on/);
  assert.match(nginx, /location = \/api\/auth\/login/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr/);
  assert.match(nginx, /location \/media\//);
  assert.match(deployment, /Cloudflare Free \(opcional\)/);
  assert.match(deployment, /Full \(strict\)/);
  assert.match(deployment, /Use cache-control header if present, bypass cache if not/);
  assert.match(deployment, /continua normalmente/);
  assert.match(deployment, /real_ip_header CF-Connecting-IP/);
  assert.match(env, /CLOUDFLARE_CACHE_PURGE_ENABLED=false/);
  assert.doesNotMatch(packageJson, /cloudflare/i);
});

test("fixa correções transitivas auditadas no gerenciador de pacotes", async () => {
  const [packageJson, workspace] = await Promise.all([
    readFile(new URL("package.json", root), "utf8"),
    readFile(new URL("pnpm-workspace.yaml", root), "utf8"),
  ]);
  assert.match(packageJson, /"sharp": "0\.35\.3"/);
  assert.match(workspace, /nanoid: 3\.3\.18/);
  assert.match(workspace, /postcss: 8\.5\.23/);
  assert.match(workspace, /sharp: 0\.35\.3/);
});

test("permite alterar as credenciais administrativas sem armazenar senha em texto claro", async () => {
  const [migration, credentialStore, accountRoute, auth, login, dashboard, deployment] = await Promise.all([
    readFile(new URL("migrations/017_admin_credentials.sql", root), "utf8"),
    readFile(new URL("lib/admin-credentials.ts", root), "utf8"),
    readFile(new URL("app/api/admin/account/route.ts", root), "utf8"),
    readFile(new URL("lib/auth.ts", root), "utf8"),
    readFile(new URL("app/api/auth/login/route.ts", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_credentials/);
  assert.match(migration, /password_hash text NOT NULL/);
  assert.match(credentialStore, /ON CONFLICT \(singleton\) DO UPDATE/);
  assert.match(credentialStore, /session_version=admin_credentials\.session_version\+1/);
  assert.match(accountRoute, /verifyPassword\(parsed\.data\.currentPassword/);
  assert.match(accountRoute, /hashPassword\(parsed\.data\.newPassword\)/);
  assert.match(accountRoute, /z\.string\(\)\.min\(12\)/);
  assert.match(auth, /credential\.sessionVersion === session\.sessionVersion/);
  assert.match(login, /getAdminCredential/);
  assert.match(dashboard, /Conta administrativa/);
  assert.match(dashboard, /Atualizar credenciais/);
  assert.match(deployment, /Configurações → Conta administrativa/);
});

test("configura o GA4 pelo painel e exclui integralmente a administração da medição", async () => {
  const [settingsStore, adminRoute, publicRoute, consent, dashboard, statistics, dockerfile, compose, deployment] = await Promise.all([
    readFile(new URL("lib/analytics-settings.ts", root), "utf8"),
    readFile(new URL("app/api/admin/analytics/route.ts", root), "utf8"),
    readFile(new URL("app/api/analytics/config/route.ts", root), "utf8"),
    readFile(new URL("components/AnalyticsConsent.tsx", root), "utf8"),
    readFile(new URL("components/AdminDashboard.tsx", root), "utf8"),
    readFile(new URL("app/api/admin/statistics/route.ts", root), "utf8"),
    readFile(new URL("Dockerfile", root), "utf8"),
    readFile(new URL("docker-compose.yml", root), "utf8"),
    readFile(new URL("DEPLOYMENT.md", root), "utf8"),
  ]);
  assert.match(settingsStore, /INSERT INTO settings\(key,value,updated_at\)/);
  assert.match(settingsStore, /NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  assert.match(adminRoute, /verifySession/);
  assert.match(adminRoute, /crossOriginMutationResponse/);
  assert.match(adminRoute, /validAnalyticsMeasurementId/);
  assert.match(publicRoute, /private, no-store/);
  assert.match(publicRoute, /verifySession/);
  assert.match(publicRoute, /enabled: false, measurementId: ""/);
  assert.match(consent, /pathname !== "\/admin" && !pathname\.startsWith\("\/admin\/"\)/);
  assert.match(consent, /consent !== "granted" \|\| !analyticsAllowedPath/);
  assert.match(consent, /fetch\("\/api\/analytics\/config", \{ cache: "no-store" \}\)/);
  assert.match(consent, /if \(!analyticsAllowedPath\) return null/);
  assert.match(dashboard, /Google Analytics 4/);
  assert.match(dashboard, /Salvar Google Analytics/);
  assert.match(statistics, /getAnalyticsSettings/);
  assert.doesNotMatch(dockerfile, /ARG NEXT_PUBLIC_GA_MEASUREMENT_ID/);
  assert.equal(compose.split("\n").filter((line) => line.includes("NEXT_PUBLIC_GA_MEASUREMENT_ID")).length, 1);
  assert.match(deployment, /nunca é carregado em `\/admin`/);
});

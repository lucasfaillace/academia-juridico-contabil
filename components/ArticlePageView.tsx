import Link from "next/link";
import { CirclePlay, MessageCircle, Tag } from "lucide-react";
import { ArticleComments } from "@/components/ArticleComments";
import { ArticleRichContent } from "@/components/ArticleRichContent";
import { ArticleShare } from "@/components/ArticleShare";
import { ArticleViewTracker } from "@/components/ArticleViewTracker";
import { PageShell } from "@/components/PageShell";
import { prepareArticleHtml } from "@/lib/article-html";
import { formatAuthorNames, type Article } from "@/lib/content";

export function ArticlePageView({ article, preview = false }: { article: Article; preview?: boolean }) {
  const share = `/blog/${article.slug}`;
  const youtubeUrl = article.youtubeUrl?.trim();
  const preparedContent = article.contentHtml ? prepareArticleHtml(article.contentHtml, {
    hasComments: true,
    references: article.bibliographicReferences,
  }) : "";
  const authorNames = article.authors?.length ? article.authors : [article.author];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    author: authorNames.map((name) => ({ "@type": "Person", name })),
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    mainEntityOfPage: share,
  };
  const serializedJsonLd = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

  return (
    <PageShell>
      {!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializedJsonLd }} />}
      {preview && (
        <aside className="private-preview-banner" aria-label="Prévia privada do artigo">
          <div className="container">
            <div>
              <strong>Prévia privada</strong>
              <span>Somente o administrador autenticado pode visualizar esta página.</span>
            </div>
            <Link className="button secondary" href={`/admin?edit=${encodeURIComponent(article.slug)}`}>Voltar à edição</Link>
          </div>
        </aside>
      )}
      <article>
        {!preview && <ArticleViewTracker slug={article.slug} />}
        <header className="article-hero">
          <div className="container reading-width">
            <Link className="back-link" href={preview ? `/admin?edit=${encodeURIComponent(article.slug)}` : "/blog"}>
              {preview ? "← Voltar ao painel" : "← Voltar ao blog"}
            </Link>
            <p className="eyebrow">Artigo</p>
            <h1>{article.title}</h1>
            {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
            <p className="article-authorline"><span>Por</span> {formatAuthorNames(authorNames)}</p>
            <div className="article-byline">
              <span>{article.publishedAt === "Rascunho" ? "Status: rascunho" : `Publicado em ${article.publishedAt}`}</span>
              <span>Atualizado em {article.updatedAt}</span>
              <span>{article.readingTime} de leitura</span>
            </div>
            {article.tags.length > 0 && (
              <ul className="article-tags" aria-label="Tags do artigo">
                {article.tags.map((tag) => (
                  <li key={`${tag.kind}-${tag.slug}`}>
                    <Link className={`tag-${tag.kind}`} href={`/blog?tag=${encodeURIComponent(tag.slug)}`}>
                      <Tag size={13} aria-hidden="true" />{tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>
        <div className="container article-layout">
          <div className="article-content">
            <p className="article-abstract"><strong>Resumo.</strong> {article.summary}</p>
            {youtubeUrl && (
              <aside className="article-video-callout" id="video-explicativo" aria-label="Vídeo explicativo do artigo">
                <CirclePlay aria-hidden="true" />
                <div><strong>Vídeo explicativo</strong><p>Veja no canal da Academia o conteúdo complementar deste artigo.</p></div>
                <a href={youtubeUrl} target="_blank" rel="noopener noreferrer">Assistir no YouTube</a>
              </aside>
            )}
            {article.contentHtml ? <ArticleRichContent html={preparedContent} /> : (
              <>
                <h2 id="introducao">1. Introdução</h2>
                <p>Conteúdo provisório. O texto definitivo será redigido e revisado pelo autor no painel editorial.</p>
              </>
            )}
            {preview ? (
              <section className="article-comments preview-comments" id="comentarios" aria-labelledby="comments-title">
                <div className="comments-heading">
                  <MessageCircle aria-hidden="true" />
                  <div>
                    <h2 id="comments-title">Comentários</h2>
                    <p>A área de comentários será habilitada para os leitores após a publicação.</p>
                  </div>
                </div>
                <div className="comment-form" aria-hidden="true">
                  <span>Prévia da área de interação</span>
                  <p>Os campos para nome e comentário aparecerão neste espaço.</p>
                </div>
              </section>
            ) : <ArticleComments slug={article.slug} />}
            {!preview && <ArticleShare title={article.title} path={share} />}
          </div>
        </div>
      </article>
    </PageShell>
  );
}

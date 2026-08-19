import Link from "next/link";
import { Search, Tag, X } from "lucide-react";
import { formatAuthorNames, type Article } from "@/lib/content";

type ArticleListProps = {
  articles: Article[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  initialTag?: string;
  query?: string;
};

function blogUrl({ page, query, tag }: { page?: number; query?: string; tag?: string }) {
  const parameters = new URLSearchParams();
  if (query?.trim()) parameters.set("q", query.trim());
  if (tag?.trim()) parameters.set("tag", tag.trim());
  if (page && page > 1) parameters.set("page", String(page));
  const search = parameters.toString();
  return search ? `/blog?${search}` : "/blog";
}

export function ArticleList({ articles, total, page, pageSize, pageCount, initialTag = "", query = "" }: ArticleListProps) {
  const selectedTagName = articles.flatMap((article) => article.tags).find((tag) => tag.slug === initialTag)?.name;
  const firstArticleNumber = (page - 1) * pageSize;

  return (
    <>
      <form className="blog-tools" action="/blog" method="get" role="search">
        {initialTag && <input type="hidden" name="tag" value={initialTag} />}
        <label className="search-field">
          <span>Pesquisar no acervo</span>
          <div>
            <Search size={18} aria-hidden="true" />
            <input name="q" defaultValue={query} maxLength={160} placeholder="Pesquise no título, texto ou notas de rodapé" />
            <button type="submit">Pesquisar</button>
          </div>
        </label>
      </form>
      {initialTag && (
        <div className="active-tag-filter" aria-live="polite">
          <Tag size={14} aria-hidden="true" />
          <span>Artigos com a tag <strong>{selectedTagName || initialTag}</strong></span>
          <Link href={blogUrl({ query })}><X size={14} aria-hidden="true" />Remover filtro</Link>
        </div>
      )}
      <p className="result-count" aria-live="polite">{total} {total === 1 ? "artigo encontrado" : "artigos encontrados"}</p>
      <div className="article-list">
        {articles.map((article, index) => (
          <article className="article-row" key={article.slug}>
            <div className="article-index">{String(firstArticleNumber + index + 1).padStart(2, "0")}</div>
            <div>
              {article.tags.length > 0 && (
                <ul className="article-tags article-list-tags" aria-label={`Tags de ${article.title}`}>
                  {article.tags.map((tag) => (
                    <li key={`${tag.kind}-${tag.slug}`}>
                      <Link className={`tag-${tag.kind}`} href={blogUrl({ tag: tag.slug, query })}>
                        <Tag size={13} aria-hidden="true" />{tag.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <h2><Link href={`/blog/${article.slug}`}>{article.title}</Link></h2>
              <p>{article.summary}</p>
              <div className="article-meta"><span>{formatAuthorNames(article.authors || [article.author])}</span><span>{article.publishedAt}</span><span>{article.readingTime} de leitura</span></div>
            </div>
          </article>
        ))}
        {!articles.length && <div className="empty-state"><h2>Nenhum artigo encontrado</h2><p>Experimente outro termo de pesquisa.</p></div>}
      </div>
      {pageCount > 1 && (
        <nav className="pagination" aria-label="Paginação">
          {page > 1
            ? <Link href={blogUrl({ page: page - 1, query, tag: initialTag })} rel="prev">Anterior</Link>
            : <span aria-disabled="true">Anterior</span>}
          <span>Página {page} de {pageCount}</span>
          {page < pageCount
            ? <Link href={blogUrl({ page: page + 1, query, tag: initialTag })} rel="next">Próxima</Link>
            : <span aria-disabled="true">Próxima</span>}
        </nav>
      )}
    </>
  );
}

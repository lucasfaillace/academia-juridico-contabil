"use client";

import Link from "next/link";
import { Search, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatAuthorNames, type Article } from "@/lib/content";

export function ArticleList({ articles, initialTag = "" }: { articles: Article[]; initialTag?: string }) {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const selectedTagName = articles.flatMap((article) => article.tags).find((tag) => tag.slug === selectedTag)?.name;
  const filtered = useMemo(() => {
    const normalized = query.toLocaleLowerCase("pt-BR").trim();
    return articles.filter((article) => {
      const haystack = [
        article.title,
        article.summary,
        ...(article.authors || [article.author]),
        ...article.tags.map((tag) => tag.name),
        article.searchText || article.contentHtml || "",
      ].join(" ").replace(/<[^>]+>/g, " ").toLocaleLowerCase("pt-BR");
      const matchesSearch = !normalized || haystack.includes(normalized);
      const matchesTag = !selectedTag || article.tags.some((tag) => tag.slug === selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [articles, query, selectedTag]);

  return (
    <>
      <div className="blog-tools">
        <label className="search-field">
          <span>Pesquisar no acervo</span>
          <div><Search size={18} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise no título, texto ou notas de rodapé" /></div>
        </label>
      </div>
      {selectedTag && (
        <div className="active-tag-filter" aria-live="polite">
          <Tag size={14} aria-hidden="true" />
          <span>Artigos com a tag <strong>{selectedTagName || selectedTag}</strong></span>
          <button type="button" onClick={() => setSelectedTag("")}><X size={14} aria-hidden="true" />Remover filtro</button>
        </div>
      )}
      <p className="result-count" aria-live="polite">{filtered.length} {filtered.length === 1 ? "artigo encontrado" : "artigos encontrados"}</p>
      <div className="article-list">
        {filtered.map((article, index) => (
          <article className="article-row" key={article.slug}>
            <div className="article-index">{String(index + 1).padStart(2, "0")}</div>
            <div>
              {article.tags.length > 0 && (
                <ul className="article-tags article-list-tags" aria-label={`Tags de ${article.title}`}>
                  {article.tags.map((tag) => (
                    <li key={`${tag.kind}-${tag.slug}`}>
                      <Link className={`tag-${tag.kind}`} href={`/blog?tag=${encodeURIComponent(tag.slug)}`}>
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
        {!filtered.length && <div className="empty-state"><h2>Nenhum artigo encontrado</h2><p>Experimente outro termo de pesquisa.</p></div>}
      </div>
      <nav className="pagination" aria-label="Paginação"><button type="button" disabled>Anterior</button><span>Página 1 de 1</span><button type="button" disabled>Próxima</button></nav>
    </>
  );
}

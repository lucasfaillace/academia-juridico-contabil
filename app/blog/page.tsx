import type { Metadata } from "next";
import { ArticleList } from "@/components/ArticleList";
import { PageShell } from "@/components/PageShell";
import { getPublishedArticles } from "@/lib/repository";

export const metadata: Metadata = { title: "Blog", description: "Artigos sobre Direito, Contabilidade e áreas relacionadas." };
export const revalidate = 60;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ tag?: string }> }) {
  const articles = await getPublishedArticles();
  const { tag = "" } = await searchParams;
  return <PageShell><section className="page-hero"><div className="container narrow"><p className="eyebrow">Blog</p><h1>Artigos</h1><p>Textos técnicos sobre temas jurídicos, contábeis e suas interfaces na atuação profissional.</p></div></section><section className="section"><div className="container"><ArticleList articles={articles} initialTag={tag} /></div></section></PageShell>;
}

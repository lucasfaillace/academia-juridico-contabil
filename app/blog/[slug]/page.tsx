import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePageView } from "@/components/ArticlePageView";
import { articles } from "@/lib/content";
import { getPublishedArticle } from "@/lib/repository";

export const revalidate = 60;

export function generateStaticParams() {
  return articles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  return article
    ? {
      title: article.title,
      description: article.summary,
      alternates: { canonical: `/blog/${slug}` },
      openGraph: { title: article.title, description: article.summary, type: "article" },
    }
    : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getPublishedArticle(slug);
  if (!article) notFound();
  return <ArticlePageView article={article} />;
}

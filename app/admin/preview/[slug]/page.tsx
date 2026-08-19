import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArticlePageView } from "@/components/ArticlePageView";
import { verifySession } from "@/lib/auth";
import { getArticleForAdminPreview } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prévia privada do artigo",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminArticlePreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const token = (await cookies()).get("academia_session")?.value;
  if (!verifySession(token)) redirect("/admin/login");

  const { slug } = await params;
  const article = await getArticleForAdminPreview(slug);
  if (!article) notFound();

  return <ArticlePageView article={article} preview />;
}

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import { buildStatistics, type StatisticsPeriod } from "@/lib/statistics";
import { listPreviewViewPoints } from "@/lib/statistics-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const periodSchema = z.enum(["7", "30", "90", "365", "all"]);

export async function GET(request: Request) {
  if (!verifySession((await cookies()).get("academia_session")?.value)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const parsedPeriod = periodSchema.safeParse(new URL(request.url).searchParams.get("period") || "30");
  if (!parsedPeriod.success) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const period = parsedPeriod.data as StatisticsPeriod;

  try {
    let articles: { slug: string; title: string }[];
    let points: { slug: string; date: string; views: number }[];
    if (!hasDatabaseConfig() && usesFileContentFallback()) {
      articles = (await listStoredArticles()).map(({ slug, title }) => ({ slug, title }));
      points = await listPreviewViewPoints();
    } else {
      const [articleResult, pointResult] = await Promise.all([
        getPool().query("SELECT slug, title FROM articles ORDER BY title"),
        getPool().query(
          `SELECT a.slug, v.viewed_on::text AS date, COUNT(*)::int AS views
           FROM article_views v
           JOIN articles a ON a.id=v.article_id
           GROUP BY a.slug, v.viewed_on
           ORDER BY v.viewed_on`,
        ),
      ]);
      articles = articleResult.rows;
      points = pointResult.rows.map((row) => ({ slug: row.slug, date: row.date, views: Number(row.views) }));
    }
    return NextResponse.json({
      ...buildStatistics(articles, points, period),
      ga4Configured: /^G-[A-Z0-9]+$/i.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || ""),
    }, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("statistics_load_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar as estatísticas." }, { status: 503 });
  }
}

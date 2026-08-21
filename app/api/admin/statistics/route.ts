import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import { buildStatistics, type StatisticsArticleSummary, type StatisticsPeriod } from "@/lib/statistics";
import { listPreviewViewPoints } from "@/lib/statistics-store";
import { getAnalyticsSettings } from "@/lib/analytics-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const periodSchema = z.enum(["7", "30", "90", "365", "all"]);

export async function GET(request: Request) {
  if (!(await verifySession((await cookies()).get("academia_session")?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const parsedPeriod = periodSchema.safeParse(new URL(request.url).searchParams.get("period") || "30");
  if (!parsedPeriod.success) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const period = parsedPeriod.data as StatisticsPeriod;

  try {
    let articles: { slug: string; title: string }[];
    let points: { slug: string; date: string; views: number }[];
    let summaries: StatisticsArticleSummary[] | undefined;
    if (!hasDatabaseConfig() && usesFileContentFallback()) {
      articles = (await listStoredArticles()).map(({ slug, title }) => ({ slug, title }));
      points = await listPreviewViewPoints();
    } else {
      const historyDays = period === "all" ? null : Math.max(Number(period), 31);
      const [summaryResult, pointResult] = await Promise.all([
        getPool().query(
          `SELECT a.slug, a.title,
                  COALESCE(SUM(v.views), 0)::bigint AS total_views,
                  COALESCE(SUM(v.views) FILTER (
                    WHERE v.viewed_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bahia')::date - 6
                  ), 0)::bigint AS views_7,
                  COALESCE(SUM(v.views) FILTER (
                    WHERE v.viewed_on >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bahia')::date - 29
                  ), 0)::bigint AS views_30,
                  MAX(v.viewed_on) FILTER (WHERE v.views > 0)::text AS last_viewed_at
           FROM articles a
           LEFT JOIN article_view_daily_totals v ON v.article_id=a.id
           GROUP BY a.id, a.slug, a.title
           ORDER BY a.title`,
        ),
        getPool().query(
          `SELECT a.slug, v.viewed_on::text AS date, v.views::bigint AS views
           FROM article_view_daily_totals v
           JOIN articles a ON a.id=v.article_id
           WHERE ($1::int IS NULL OR v.viewed_on >=
             (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bahia')::date - ($1::int - 1))
           ORDER BY v.viewed_on`,
          [historyDays],
        ),
      ]);
      articles = summaryResult.rows.map((row) => ({ slug: row.slug, title: row.title }));
      summaries = summaryResult.rows.map((row) => ({
        slug: row.slug,
        totalViews: Number(row.total_views),
        views7: Number(row.views_7),
        views30: Number(row.views_30),
        lastViewedAt: row.last_viewed_at,
      }));
      points = pointResult.rows.map((row) => ({ slug: row.slug, date: row.date, views: Number(row.views) }));
    }
    const analyticsSettings = await getAnalyticsSettings();
    return NextResponse.json({
      ...buildStatistics(articles, points, period, summaries),
      ga4Configured: analyticsSettings.enabled,
    }, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch (error) {
    console.error("statistics_load_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível carregar as estatísticas." }, { status: 503 });
  }
}

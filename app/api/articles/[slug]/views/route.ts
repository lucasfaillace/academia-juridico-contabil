import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import { viewDateInBahia } from "@/lib/statistics";
import { savePreviewView } from "@/lib/statistics-store";
import { consumeRateLimit, crossOriginMutationResponse, requestAddress } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const visitorCookie = "academia_visitor";
const botPattern = /bot|crawl|spider|slurp|headless|preview|monitor|uptime|lighthouse|pagespeed|facebookexternalhit/i;

function validSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 260;
}

function dedupeKey(slug: string, visitorId: string) {
  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const secret = process.env.ANALYTICS_HASH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Segredo de anonimização ausente");
  return createHmac("sha256", secret).update(`${visitorId}:${slug}:${bucket}`).digest("hex");
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const rate = consumeRateLimit("article-view", requestAddress(request), { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { counted: false, reason: "rate-limit" },
      { status: 429, headers: { "retry-after": String(rate.retryAfter) } },
    );
  }
  const { slug } = await params;
  if (!validSlug(slug)) return NextResponse.json({ counted: false }, { status: 400 });
  const cookieStore = await cookies();
  if (await verifySession(cookieStore.get("academia_session")?.value)) {
    return NextResponse.json({ counted: false, reason: "administrator" }, { status: 202 });
  }
  const userAgent = request.headers.get("user-agent") || "";
  if (!userAgent || botPattern.test(userAgent)) {
    return NextResponse.json({ counted: false, reason: "automated" }, { status: 202 });
  }

  const visitorId = cookieStore.get(visitorCookie)?.value || randomUUID();
  const key = dedupeKey(slug, visitorId);
  let counted = false;

  try {
    if (!hasDatabaseConfig() && usesFileContentFallback()) {
      const article = (await listStoredArticles()).find((item) => item.slug === slug && item.status === "published");
      if (!article) return NextResponse.json({ counted: false }, { status: 404 });
      counted = await savePreviewView({
        slug,
        viewedAt: new Date().toISOString(),
        viewedOn: viewDateInBahia(),
        dedupeKey: key,
      });
    } else {
      const pool = getPool();
      const result = await pool.query(
        `WITH inserted_view AS (
           INSERT INTO article_views(article_id, viewed_on, dedupe_key)
           SELECT id, $2::date, $3
           FROM articles
           WHERE slug=$1 AND status='published'
           ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
           RETURNING article_id, viewed_on
         )
         INSERT INTO article_view_daily_totals(article_id, viewed_on, views)
         SELECT article_id, viewed_on, COUNT(*)::bigint
         FROM inserted_view
         GROUP BY article_id, viewed_on
         ON CONFLICT (article_id, viewed_on) DO UPDATE SET
           views=article_view_daily_totals.views + EXCLUDED.views,
           updated_at=now()
         RETURNING article_id`,
        [slug, viewDateInBahia(), key],
      );
      counted = Boolean(result.rowCount);
    }
  } catch (error) {
    console.error("article_view_record_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ counted: false }, { status: 503 });
  }

  const response = NextResponse.json({ counted }, { status: counted ? 201 : 200 });
  if (!cookieStore.get(visitorCookie)) {
    response.cookies.set(visitorCookie, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  }
  response.headers.set("cache-control", "private, no-store, max-age=0");
  return response;
}

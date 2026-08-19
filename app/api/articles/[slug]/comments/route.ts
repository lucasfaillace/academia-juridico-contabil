import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { listPreviewComments, savePreviewComment } from "@/lib/comment-store";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { usesFileContentFallback } from "@/lib/preview-store";

const commentSchema = z.object({
  authorName: z.string().trim().min(2).max(100),
  body: z.string().trim().min(2).max(4000),
  parentId: z.string().uuid().optional(),
});

type RateEntry = { count: number; expiresAt: number };
declare global { var academiaCommentRate: Map<string, RateEntry> | undefined; }

function allowRequest(key: string) {
  const now = Date.now();
  const rates = global.academiaCommentRate || new Map<string, RateEntry>();
  global.academiaCommentRate = rates;
  const entry = rates.get(key);
  if (!entry || entry.expiresAt < now) {
    rates.set(key, { count: 1, expiresAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count += 1;
  return true;
}

function publicComment(comment: Record<string, unknown>) {
  return {
    id: comment.id,
    parentId: comment.parent_id,
    authorName: comment.author_name,
    body: comment.body,
    isAdmin: comment.is_admin,
    createdAt: comment.created_at,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const isAdmin = verifySession((await cookies()).get("academia_session")?.value);
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const comments = await listPreviewComments(slug);
    return NextResponse.json({ comments: comments.map(publicComment), isAdmin, adminName: isAdmin ? process.env.DEFAULT_AUTHOR_NAME || "Autor" : undefined });
  }
  try {
    const result = await getPool().query(
      `SELECT c.id, c.parent_id, c.author_name, c.body, c.is_admin, c.created_at
       FROM article_comments c
       JOIN articles a ON a.id=c.article_id
       WHERE a.slug=$1 AND a.status='published' AND c.status='published'
       ORDER BY c.created_at ASC`,
      [slug],
    );
    return NextResponse.json({ comments: result.rows.map(publicComment), isAdmin, adminName: isAdmin ? process.env.DEFAULT_AUTHOR_NAME || "Autor" : undefined });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os comentários." }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestHeaders = await headers();
  const address = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
  if (!allowRequest(address)) {
    return NextResponse.json({ error: "Aguarde um minuto antes de enviar outro comentário." }, { status: 429 });
  }

  const parsed = commentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe seu nome e escreva um comentário entre 2 e 4.000 caracteres." }, { status: 400 });
  }

  const isAdmin = verifySession((await cookies()).get("academia_session")?.value);
  const authorName = isAdmin ? process.env.DEFAULT_AUTHOR_NAME || "Autor" : parsed.data.authorName;

  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const comment = await savePreviewComment({
        articleSlug: slug,
        parentId: parsed.data.parentId,
        authorName,
        body: parsed.data.body,
        isAdmin,
      });
      return NextResponse.json(publicComment(comment), { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível comentar." }, { status: 400 });
    }
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const article = await client.query("SELECT id FROM articles WHERE slug=$1 AND status='published'", [slug]);
    if (!article.rowCount) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });
    if (parsed.data.parentId) {
      const parent = await client.query("SELECT id FROM article_comments WHERE id=$1 AND article_id=$2", [parsed.data.parentId, article.rows[0].id]);
      if (!parent.rowCount) return NextResponse.json({ error: "Comentário de origem não encontrado." }, { status: 400 });
    }
    const result = await client.query(
      `INSERT INTO article_comments (article_id, parent_id, author_name, body, is_admin)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, parent_id, author_name, body, is_admin, created_at`,
      [article.rows[0].id, parsed.data.parentId || null, authorName, parsed.data.body, isAdmin],
    );
    return NextResponse.json(publicComment(result.rows[0]), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível publicar o comentário." }, { status: 503 });
  } finally {
    client.release();
  }
}

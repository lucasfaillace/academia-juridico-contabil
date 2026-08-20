import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { deletePreviewComment, listAllPreviewComments, updatePreviewComment } from "@/lib/comment-store";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { readJsonBody } from "@/lib/request-json";

const updateSchema = z.object({
  id: z.string().uuid(),
  body: z.string().trim().min(2).max(4000),
});
const deleteSchema = z.object({ id: z.string().uuid() });

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

function adminComment(row: Record<string, unknown>) {
  return {
    id: row.id,
    articleSlug: row.article_slug,
    articleTitle: row.article_title,
    authorName: row.author_name,
    body: row.body,
    isAdmin: row.is_admin,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const [comments, articles] = await Promise.all([listAllPreviewComments(), listStoredArticles()]);
    const titles = new Map(articles.map((article) => [article.slug, article.title]));
    return NextResponse.json({
      comments: comments.map((comment) => adminComment({
        ...comment,
        article_title: titles.get(comment.article_slug) || comment.article_slug,
      })),
    });
  }
  try {
    const result = await getPool().query(
      `SELECT c.id,c.author_name,c.body,c.is_admin,c.status,c.created_at,
              a.slug AS article_slug,a.title AS article_title
       FROM article_comments c
       JOIN articles a ON a.id=c.article_id
       ORDER BY c.created_at DESC`,
    );
    return NextResponse.json({ comments: result.rows.map(adminComment) });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os comentários." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "O comentário deve ter entre 2 e 4.000 caracteres." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      return NextResponse.json(await updatePreviewComment(parsed.data.id, parsed.data.body));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o comentário." }, { status: 404 });
    }
  }
  try {
    const result = await getPool().query(
      "UPDATE article_comments SET body=$1,updated_at=NOW() WHERE id=$2 RETURNING id",
      [parsed.data.body, parsed.data.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Comentário não encontrado." }, { status: 404 });
    return NextResponse.json({ updated: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o comentário." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Comentário inválido." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const deleted = await deletePreviewComment(parsed.data.id);
      return NextResponse.json({ deleted });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir o comentário." }, { status: 404 });
    }
  }
  try {
    const result = await getPool().query("DELETE FROM article_comments WHERE id=$1 RETURNING id", [parsed.data.id]);
    if (!result.rowCount) return NextResponse.json({ error: "Comentário não encontrado." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir o comentário." }, { status: 503 });
  }
}

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { listStoredArticles, usesFileContentFallback } from "@/lib/preview-store";
import { createPreviewTag, deletePreviewTag, listPreviewTags, slugifyTag, updatePreviewTag } from "@/lib/tag-store";
import { crossOriginMutationResponse } from "@/lib/request-security";
import { purgeOptionalCloudflareCache } from "@/lib/cloudflare-cache";
import { readJsonBody } from "@/lib/request-json";

const tagSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["juridica", "contabil", "geral"]),
});
const updateSchema = tagSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

async function invalidateTagPages() {
  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
  await purgeOptionalCloudflareCache({ paths: ["/", "/blog"], prefixes: ["/blog/"] });
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const [tags, articles] = await Promise.all([listPreviewTags(), listStoredArticles()]);
    return NextResponse.json(tags.map((tag) => ({
      ...tag,
      articleCount: articles.filter((article) => article.tags?.some((item) => (item.slug || slugifyTag(item.name)) === tag.slug)).length,
    })));
  }
  try {
    const result = await getPool().query(
      `SELECT t.id,t.name,t.slug,t.kind,COUNT(at.article_id)::int AS "articleCount"
       FROM tags t
       LEFT JOIN article_tags at ON at.tag_id=t.id
       GROUP BY t.id
       ORDER BY lower(t.name)`,
    );
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar as tags." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = tagSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Informe um nome e uma área válidos." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const tag = await createPreviewTag(parsed.data);
      await invalidateTagPages();
      return NextResponse.json(tag, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível criar a tag." }, { status: 409 });
    }
  }
  const slug = slugifyTag(parsed.data.name);
  try {
    const result = await getPool().query(
      "INSERT INTO tags(name,slug,kind) VALUES($1,$2,$3) RETURNING id,name,slug,kind",
      [parsed.data.name, slug, parsed.data.kind],
    );
    await invalidateTagPages();
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch {
    return NextResponse.json({ error: "Já existe uma tag com esse nome." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = updateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Dados da tag inválidos." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      const tag = await updatePreviewTag(parsed.data.id, parsed.data);
      await invalidateTagPages();
      return NextResponse.json(tag);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a tag." }, { status: 409 });
    }
  }
  try {
    const result = await getPool().query(
      "UPDATE tags SET name=$1,slug=$2,kind=$3 WHERE id=$4 RETURNING id,name,slug,kind",
      [parsed.data.name, slugifyTag(parsed.data.name), parsed.data.kind, parsed.data.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });
    await invalidateTagPages();
    return NextResponse.json(result.rows[0]);
  } catch {
    return NextResponse.json({ error: "Já existe uma tag com esse nome." }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Tag inválida." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    try {
      await deletePreviewTag(parsed.data.id);
      await invalidateTagPages();
      return NextResponse.json({ deleted: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível excluir a tag." }, { status: 404 });
    }
  }
  const result = await getPool().query("DELETE FROM tags WHERE id=$1 RETURNING id", [parsed.data.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });
  await invalidateTagPages();
  return NextResponse.json({ deleted: true });
}

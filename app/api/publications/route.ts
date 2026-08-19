import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getPool, hasDatabaseConfig } from "@/lib/db";
import { deleteStoredPublication, listStoredPublications, saveStoredPublication } from "@/lib/publication-store";
import { usesFileContentFallback } from "@/lib/preview-store";
import { crossOriginMutationResponse } from "@/lib/request-security";

const publicationSchema = z.object({
  id: z.string().uuid().optional(),
  referenceHtml: z.string().min(1).max(40_000),
  pdfKey: z.string().max(500).default("").refine((value) => !value || /^[a-f0-9-]+-publicacao\.pdf$/i.test(value)),
  externalUrl: z.string().trim().max(1000).default("").refine((value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }),
  publicationDate: z.iso.date(),
  status: z.enum(["draft", "published"]),
});

const deleteSchema = z.object({ id: z.string().uuid() });

function authenticated(token: string | undefined) {
  return verifySession(token);
}

function sanitizeReference(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "a", "sup", "sub"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: { ...attributes, rel: "noopener noreferrer" },
      }),
    },
  }).trim();
}

export async function GET() {
  if (!authenticated((await cookies()).get("academia_session")?.value)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    return NextResponse.json(await listStoredPublications());
  }
  try {
    const result = await getPool().query(`
      SELECT id, reference_html, pdf_key, external_url,
             publication_date::text, status, created_at::text, updated_at::text
      FROM publications
      ORDER BY publication_date DESC, created_at DESC
    `);
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json({ error: "Banco de dados indisponível" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!authenticated((await cookies()).get("academia_session")?.value)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const parsed = publicationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Revise a referência, a data e os endereços informados." }, { status: 400 });
  }
  const referenceHtml = sanitizeReference(parsed.data.referenceHtml);
  if (!referenceHtml || !referenceHtml.replace(/<[^>]+>/g, "").trim()) {
    return NextResponse.json({ error: "Informe a referência completa." }, { status: 400 });
  }
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const publication = await saveStoredPublication({ ...parsed.data, referenceHtml });
    revalidatePath("/publicacoes");
    return NextResponse.json(publication, { status: 201 });
  }
  try {
    const result = parsed.data.id
      ? await getPool().query(
        `UPDATE publications
         SET reference_html=$1, pdf_key=$2, external_url=$3, publication_date=$4, status=$5, updated_at=NOW()
         WHERE id=$6
         RETURNING id, reference_html, pdf_key, external_url, publication_date::text, status, created_at::text, updated_at::text`,
        [referenceHtml, parsed.data.pdfKey || null, parsed.data.externalUrl || null, parsed.data.publicationDate, parsed.data.status, parsed.data.id],
      )
      : await getPool().query(
        `INSERT INTO publications(reference_html,pdf_key,external_url,publication_date,status)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, reference_html, pdf_key, external_url, publication_date::text, status, created_at::text, updated_at::text`,
        [referenceHtml, parsed.data.pdfKey || null, parsed.data.externalUrl || null, parsed.data.publicationDate, parsed.data.status],
      );
    if (!result.rowCount) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
    revalidatePath("/publicacoes");
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("publication_save_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível salvar a publicação." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!authenticated((await cookies()).get("academia_session")?.value)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Publicação inválida." }, { status: 400 });
  if (!hasDatabaseConfig() && usesFileContentFallback()) {
    const deleted = await deleteStoredPublication(parsed.data.id);
    if (!deleted) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
    revalidatePath("/publicacoes");
    return NextResponse.json({ ok: true });
  }
  try {
    const result = await getPool().query("DELETE FROM publications WHERE id=$1", [parsed.data.id]);
    if (!result.rowCount) return NextResponse.json({ error: "Publicação não encontrada." }, { status: 404 });
    revalidatePath("/publicacoes");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir a publicação." }, { status: 503 });
  }
}

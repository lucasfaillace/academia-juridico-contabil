import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import sanitizeHtml from "sanitize-html";
import { verifySession } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

const maxBytes = 15 * 1024 * 1024;
export async function POST(request: Request) {
  if (!verifySession((await cookies()).get("academia_session")?.value)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > maxBytes || !file.name.toLowerCase().endsWith(".docx")) return NextResponse.json({ error: "Envie um arquivo .docx válido de até 15 MB." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) return NextResponse.json({ error: "O conteúdo do arquivo não corresponde a um documento .docx." }, { status: 400 });
  try {
    const originalKey = await getStorage().saveOriginal(file.name, buffer);
    const result = await mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.imgElement(async (image) => ({ src: `data:${image.contentType};base64,${(await image.read("base64"))}` })) });
    const clean = sanitizeHtml(result.value, { allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "sup", "sub", "u"]), allowedAttributes: { a: ["href", "name", "id"], img: ["src", "alt", "title"], "*": ["id"] }, allowedSchemes: ["http", "https", "mailto", "data"] });
    return NextResponse.json({ html: clean, originalKey, messages: result.messages.map((item) => item.message) });
  } catch { return NextResponse.json({ error: "Não foi possível converter o documento. O arquivo foi rejeitado com segurança." }, { status: 422 }); }
}

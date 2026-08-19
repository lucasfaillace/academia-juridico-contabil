import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getAnalyticsSettings,
  saveAnalyticsSettings,
  validAnalyticsMeasurementId,
} from "@/lib/analytics-settings";
import { verifySession } from "@/lib/auth";
import { crossOriginMutationResponse } from "@/lib/request-security";

const settingsSchema = z.object({
  enabled: z.boolean(),
  measurementId: z.string().trim().max(40),
}).superRefine((value, context) => {
  if (value.enabled && !validAnalyticsMeasurementId(value.measurementId)) {
    context.addIssue({ code: "custom", path: ["measurementId"], message: "ID de medição inválido" });
  }
});

async function authorized() {
  return verifySession((await cookies()).get("academia_session")?.value);
}

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await getAnalyticsSettings(), {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar a configuração do Google Analytics." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  if (!(await authorized())) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Informe um ID de medição válido no formato G-XXXXXXXXXX ou desative a integração." },
      { status: 400 },
    );
  }
  try {
    const settings = await saveAnalyticsSettings(parsed.data);
    return NextResponse.json(settings, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível salvar a configuração do Google Analytics." }, { status: 503 });
  }
}


import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAnalyticsSettings } from "@/lib/analytics-settings";
import { verifySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = (await cookies()).get("academia_session")?.value;
    if (await verifySession(token)) {
      return NextResponse.json(
        { enabled: false, measurementId: "" },
        { headers: { "cache-control": "private, no-store, max-age=0" } },
      );
    }
    const settings = await getAnalyticsSettings();
    return NextResponse.json({
      enabled: settings.enabled,
      measurementId: settings.enabled ? settings.measurementId : "",
    }, { headers: { "cache-control": "private, no-store, max-age=0" } });
  } catch {
    // A integração falha fechada: indisponibilidade de configuração nunca deve
    // impedir a navegação nem carregar o Google Analytics por engano.
    return NextResponse.json(
      { enabled: false, measurementId: "" },
      { headers: { "cache-control": "private, no-store, max-age=0" } },
    );
  }
}

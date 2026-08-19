import { NextResponse } from "next/server";
import { getPool, hasDatabaseConfig } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseConfig()) return NextResponse.json({ status: "degraded", database: "not_configured" }, { status: 503 });
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}

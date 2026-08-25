import { NextResponse } from "next/server";
import { crossOriginMutationResponse } from "@/lib/request-security";

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const response = NextResponse.redirect(new URL("/", publicUrl || request.url));
  response.cookies.set("academia_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

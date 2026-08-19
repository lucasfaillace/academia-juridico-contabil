import { NextResponse } from "next/server";
import { crossOriginMutationResponse } from "@/lib/request-security";

export async function POST(request: Request) {
  const originError = crossOriginMutationResponse(request);
  if (originError) return originError;
  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  response.cookies.set("academia_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

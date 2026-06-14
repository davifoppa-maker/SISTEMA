import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizationUrl, isTinyConfigured } from "@/lib/services/tiny-api";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Inicia o consentimento OAuth: gera um state anti-CSRF (guardado em cookie
// HttpOnly, pois a memória não sobrevive entre invocações serverless) e
// redireciona o usuário para o Tiny.
export function GET(_req: NextRequest) {
  if (!isTinyConfigured()) {
    return fail(
      "Olist Tiny não configurado. Defina TINY_CLIENT_ID e TINY_CLIENT_SECRET.",
      503,
    );
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthorizationUrl(state));
  res.cookies.set("tiny_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

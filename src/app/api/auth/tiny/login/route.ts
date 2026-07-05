import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthorizationUrl, isTinyConfigured } from "@/lib/services/tiny-api";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Inicia o consentimento OAuth: gera um state anti-CSRF (guardado em cookie
// HttpOnly, pois a memória não sobrevive entre invocações serverless) e
// redireciona o usuário para o Tiny.
// ?empresa=ecopro para conectar a segunda empresa.
export function GET(req: NextRequest) {
  const empresa = req.nextUrl.searchParams.get("empresa") ?? "nyer";
  const companyId = empresa === "ecopro" ? "ecopro" : "nyer";

  if (!isTinyConfigured(companyId)) {
    const envPrefix = companyId === "ecopro" ? "ECOPRO_" : "";
    return fail(
      `Olist Tiny (${companyId}) não configurado. Defina ${envPrefix}TINY_CLIENT_ID e ${envPrefix}TINY_CLIENT_SECRET.`,
      503,
    );
  }
  const state = randomBytes(16).toString("hex");
  // redirect_uri baseado no domínio ATUAL (evita erro de domínio antigo/APP_URL).
  const redirectUri = `${req.nextUrl.origin}/api/auth/tiny/callback`;
  const res = NextResponse.redirect(buildAuthorizationUrl(state, companyId, redirectUri));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
  res.cookies.set("tiny_oauth_state", state, cookieOpts);
  // Salva a empresa no cookie para o callback saber qual conta conectar.
  res.cookies.set("tiny_oauth_empresa", companyId, cookieOpts);
  // Guarda o redirect_uso usado, para o callback trocar o code com o MESMO valor.
  res.cookies.set("tiny_oauth_redirect", redirectUri, cookieOpts);
  return res;
}

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authCredentials, computeAuthToken } from "@/lib/auth-token";

// Rotas públicas (não exigem login):
//  - /login e a API de autenticação
//  - OAuth do Tiny (/api/auth/tiny/*) — chamado externamente
//  - cron (CRON_SECRET) e webhooks (Tiny/Meta) — chamados por serviços externos
//  - /api/debug (protegida pela própria chave)
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/cron", "/api/webhooks", "/api/debug"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const { username, password } = authCredentials();
  const expected = await computeAuthToken(username, password);
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === expected) return NextResponse.next();

  // API → 401; páginas → redireciona para o login preservando o destino.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Roda em tudo, menos assets estáticos e imagens.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt)).*)"],
};

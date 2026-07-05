import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authCredentials, repCredentials, computeAuthToken, REP_ALLOWED_PREFIXES } from "@/lib/auth-token";

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

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const admin = authCredentials();
  const rep = repCredentials();
  const adminToken = await computeAuthToken(admin.username, admin.password);
  const repToken = await computeAuthToken(rep.username, rep.password);

  // Admin: acesso total.
  if (token && token === adminToken) return NextResponse.next();

  // Representante: só o Gestor de Margem (e o próprio logout). Qualquer outra
  // rota é redirecionada para /margem (páginas) ou barrada (APIs).
  if (token && token === repToken) {
    const repOk = REP_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (repOk) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Sem permissão" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/margem";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Não autenticado. API → 401; páginas → login preservando o destino.
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

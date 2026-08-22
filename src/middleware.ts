import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authCredentials, expedCredentials, comercialCredentials, computeAuthToken, EXPED_ALLOWED_PREFIXES, EXPED_ALLOWED_API_PREFIXES, COMERCIAL_ALLOWED_PREFIXES, COMERCIAL_ALLOWED_API_PREFIXES } from "@/lib/auth-token";

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
  const exped = expedCredentials();
  const adminToken = await computeAuthToken(admin.username, admin.password);
  const expedToken = await computeAuthToken(exped.username, exped.password);

  // Admin: acesso total.
  if (token && token === adminToken) return NextResponse.next();

  // Expedição: SÓ a área de expedição — páginas permitidas + APIs da allowlist.
  // Página fora → redireciona p/ checkout. API fora → 403.
  if (token && token === expedToken) {
    const paginaOk = EXPED_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    const apiOk = EXPED_ALLOWED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (paginaOk || apiOk) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Sem permissão" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/checkout";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Comercial: SÓ a área comercial (Dashboard/Saúde/Gestor de Margem).
  const comercial = comercialCredentials();
  const comercialToken = await computeAuthToken(comercial.username, comercial.password);
  if (token && token === comercialToken) {
    const paginaOk = COMERCIAL_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    const apiOk = COMERCIAL_ALLOWED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (paginaOk || apiOk) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Sem permissão" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/comercial";
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

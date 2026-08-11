import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCredentials, computeAuthToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

// POST /api/auth/login — valida usuário/senha do ADMIN e grava o cookie de sessão.
// (O login de representante foi removido.)
export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const user = (body.username ?? "").trim();
  const pass = body.password ?? "";

  const admin = authCredentials();
  if (user !== admin.username || pass !== admin.password) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = await computeAuthToken(admin.username, admin.password);
  const res = NextResponse.json({ ok: true, perfil: "admin", redirect: null });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

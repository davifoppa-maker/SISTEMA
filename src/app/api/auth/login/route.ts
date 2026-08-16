import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCredentials, expedCredentials, computeAuthToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

// POST /api/auth/login — valida usuário/senha (admin OU expedição) e grava o cookie.
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
  const exped = expedCredentials();

  let cred: { username: string; password: string } | null = null;
  let perfil: "admin" | "exped" | null = null;
  if (user === admin.username && pass === admin.password) { cred = admin; perfil = "admin"; }
  else if (user === exped.username && pass === exped.password) { cred = exped; perfil = "exped"; }

  if (!cred) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = await computeAuthToken(cred.username, cred.password);
  const res = NextResponse.json({ ok: true, perfil, redirect: perfil === "exped" ? "/checkout" : null });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCredentials, repCredentials, computeAuthToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

// POST /api/auth/login — valida usuário/senha (admin OU representante) e grava o
// cookie de sessão. O middleware distingue o perfil pelo token do cookie.
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
  const rep = repCredentials();

  let cred: { username: string; password: string } | null = null;
  let perfil: "admin" | "rep" | null = null;
  if (user === admin.username && pass === admin.password) { cred = admin; perfil = "admin"; }
  else if (user === rep.username && pass === rep.password) { cred = rep; perfil = "rep"; }

  if (!cred) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = await computeAuthToken(cred.username, cred.password);
  const res = NextResponse.json({ ok: true, perfil, redirect: perfil === "rep" ? "/margem" : null });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

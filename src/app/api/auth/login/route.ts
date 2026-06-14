import { NextResponse } from "next/server";
import { AUTH_COOKIE, authCredentials, computeAuthToken } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

// POST /api/auth/login — valida usuário/senha e grava o cookie de sessão.
export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Requisição inválida." }, { status: 400 });
  }

  const cred = authCredentials();
  const okUser = (body.username ?? "").trim() === cred.username;
  const okPass = (body.password ?? "") === cred.password;
  if (!okUser || !okPass) {
    return NextResponse.json({ ok: false, error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const token = await computeAuthToken(cred.username, cred.password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return res;
}

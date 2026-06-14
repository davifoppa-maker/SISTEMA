import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth-token";

export const dynamic = "force-dynamic";

// POST /api/auth/logout — limpa o cookie de sessão.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

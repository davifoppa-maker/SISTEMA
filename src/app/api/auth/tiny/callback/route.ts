import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";

// Callback do OAuth: valida o state, troca o code por tokens (persistidos) e
// redireciona de volta para Configurações com o resultado.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const settings = new URL("/settings", url.origin);

  if (error) {
    settings.searchParams.set("tiny", "erro");
    settings.searchParams.set("detalhe", error);
    return NextResponse.redirect(settings);
  }

  const expectedState = req.cookies.get("tiny_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    settings.searchParams.set("tiny", "erro");
    settings.searchParams.set("detalhe", "state_invalido");
    return NextResponse.redirect(settings);
  }

  try {
    await exchangeCodeForTokens(code);
    settings.searchParams.set("tiny", "conectado");
  } catch (err) {
    settings.searchParams.set("tiny", "erro");
    settings.searchParams.set("detalhe", err instanceof Error ? err.message : "falha");
  }

  const res = NextResponse.redirect(settings);
  res.cookies.delete("tiny_oauth_state");
  return res;
}

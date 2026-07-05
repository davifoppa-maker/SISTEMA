import { ok, fail } from "@/lib/api";
import { getValidAccessToken } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Diagnóstico: força a obtenção de um access_token válido (renova via refresh se
// expirado) para cada empresa e mostra sucesso ou o erro exato da renovação.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const out: Record<string, unknown> = {};
  for (const empresa of ["nyer", "ecopro"]) {
    try {
      const token = await getValidAccessToken(empresa);
      out[empresa] = { ok: true, token_preview: `${token.slice(0, 12)}…`, len: token.length };
    } catch (e) {
      out[empresa] = { ok: false, erro: e instanceof Error ? e.message : String(e) };
    }
  }
  return ok(out);
}

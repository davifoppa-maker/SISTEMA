import { ok, fail } from "@/lib/api";
import { getBrudamConfig } from "@/lib/services/freight/brudam";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico: testa vários endpoints de login da Multi (Brudam) e mostra o
// status + corpo CRU de cada um, para descobrirmos o fluxo de autenticação real.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const c = getBrudamConfig();
  const base = c.apiBaseUrl;

  // Variações de endpoint + corpo, para mapear o que a Multi aceita.
  const tentativas: Array<{ ep: string; body: Record<string, unknown> }> = [
    { ep: "/login", body: { usuario: c.usuario, senha: c.senha } },
    { ep: "/usuarios/autenticar", body: { usuario: c.usuario, senha: c.senha } },
    { ep: "/auth/login", body: { usuario: c.usuario, senha: c.senha } },
    { ep: "/autenticar", body: { usuario: c.usuario, senha: c.senha } },
    { ep: "/login", body: { user: c.usuario, password: c.senha } },
    { ep: "/token", body: { usuario: c.usuario, senha: c.senha } },
  ];

  const resultados = [];
  for (const t of tentativas) {
    try {
      const res = await fetch(`${base}${t.ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(t.body),
      });
      const text = await res.text();
      resultados.push({
        endpoint: t.ep,
        bodyKeys: Object.keys(t.body),
        status: res.status,
        resposta: text.slice(0, 400),
      });
    } catch (err) {
      resultados.push({ endpoint: t.ep, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return ok({
    base,
    temUsuario: Boolean(c.usuario),
    temSenha: Boolean(c.senha),
    temToken: Boolean(c.token),
    resultados,
  });
}

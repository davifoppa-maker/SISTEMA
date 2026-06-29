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

  const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  const authHeaders = { ...jsonHeaders, usuario: c.usuario, senha: c.senha };
  const tokenHeaders = { ...jsonHeaders, usuario: c.usuario, token: c.token };

  // Variações de endpoint + método + onde manda usuário/senha (body vs headers).
  const tentativas: Array<{
    nome: string;
    ep: string;
    method: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
  }> = [
    { nome: "login body", ep: "/login", method: "POST", headers: jsonHeaders, body: { usuario: c.usuario, senha: c.senha } },
    { nome: "login headers", ep: "/login", method: "POST", headers: authHeaders },
    { nome: "login GET headers", ep: "/login", method: "GET", headers: authHeaders },
    { nome: "autenticar headers", ep: "/usuarios/autenticar", method: "POST", headers: authHeaders },
    { nome: "token headers", ep: "/token", method: "POST", headers: authHeaders },
    { nome: "raiz headers GET", ep: "", method: "GET", headers: authHeaders },
    { nome: "cotacoes usuario+senha", ep: "/cotacoes", method: "POST", headers: authHeaders, body: { cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    // Hipótese principal: usuario + token nos headers (sem login).
    { nome: "cotacoes usuario+token", ep: "/cotacoes", method: "POST", headers: tokenHeaders, body: { cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    { nome: "login usuario+token headers", ep: "/login", method: "POST", headers: tokenHeaders },
    { nome: "raiz usuario+token GET", ep: "", method: "GET", headers: tokenHeaders },
  ];

  const resultados = [];
  for (const t of tentativas) {
    try {
      const res = await fetch(`${base}${t.ep}`, {
        method: t.method,
        headers: t.headers,
        body: t.body ? JSON.stringify(t.body) : undefined,
      });
      const text = await res.text();
      resultados.push({
        nome: t.nome,
        endpoint: t.ep || "(raiz)",
        method: t.method,
        enviou: t.body ? "body" : "headers",
        status: res.status,
        resposta: text.slice(0, 350),
      });
    } catch (err) {
      resultados.push({ nome: t.nome, erro: err instanceof Error ? err.message : String(err) });
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

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
    // /cotacoes com credenciais DENTRO do body (várias formas de nomear).
    { nome: "cot body usuario+senha", ep: "/cotacoes", method: "POST", headers: jsonHeaders, body: { usuario: c.usuario, senha: c.senha, cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    { nome: "cot body usuario+token", ep: "/cotacoes", method: "POST", headers: jsonHeaders, body: { usuario: c.usuario, token: c.token, cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    { nome: "cot body usuario+senha+token", ep: "/cotacoes", method: "POST", headers: jsonHeaders, body: { usuario: c.usuario, senha: c.senha, token: c.token, cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    { nome: "cot body acesso{}", ep: "/cotacoes", method: "POST", headers: jsonHeaders, body: { acesso: { usuario: c.usuario, senha: c.senha }, cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    { nome: "cot headers usuario+senha+token", ep: "/cotacoes", method: "POST", headers: { ...authHeaders, token: c.token }, body: { cep_origem: c.cepOrigem, cep_destino: "01001000" } },
    // Login retornando token: tenta com body além dos headers.
    { nome: "login body usuario+senha+token", ep: "/login", method: "POST", headers: jsonHeaders, body: { usuario: c.usuario, senha: c.senha, token: c.token } },
  ];

  // Hipótese form-urlencoded e query-string (em vez de JSON).
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const credForm = `usuario=${encodeURIComponent(c.usuario)}&senha=${encodeURIComponent(c.senha)}`;
  const credQuery = `?usuario=${encodeURIComponent(c.usuario)}&senha=${encodeURIComponent(c.senha)}`;
  const extras: Array<{ nome: string; url: string; method: string; headers: Record<string, string>; rawBody?: string }> = [
    { nome: "FORM cotacoes usuario+senha", url: `${base}/cotacoes`, method: "POST", headers: formHeaders, rawBody: `${credForm}&cep_origem=${c.cepOrigem}&cep_destino=01001000` },
    { nome: "FORM login usuario+senha", url: `${base}/login`, method: "POST", headers: formHeaders, rawBody: credForm },
    { nome: "QUERY cotacoes (json body)", url: `${base}/cotacoes${credQuery}`, method: "POST", headers: jsonHeaders, rawBody: JSON.stringify({ cep_origem: c.cepOrigem, cep_destino: "01001000" }) },
    { nome: "QUERY login GET", url: `${base}/login${credQuery}`, method: "GET", headers: jsonHeaders },
    { nome: "BASIC cotacoes", url: `${base}/cotacoes`, method: "POST", headers: { ...jsonHeaders, Authorization: `Basic ${Buffer.from(`${c.usuario}:${c.senha}`).toString("base64")}` }, rawBody: JSON.stringify({ cep_origem: c.cepOrigem, cep_destino: "01001000" }) },
    // Cotação SEM body (tudo na query) — a API só autentica requisições sem corpo.
    { nome: "GET cotacoes query full", url: `${base}/cotacoes${credQuery}&cep_origem=${c.cepOrigem}&cep_destino=01001000&peso=5&valor=100&volumes=1`, method: "GET", headers: jsonHeaders },
    { nome: "POST cotacoes query sem body", url: `${base}/cotacoes${credQuery}&cep_origem=${c.cepOrigem}&cep_destino=01001000&peso=5&valor=100&volumes=1`, method: "POST", headers: jsonHeaders },
    // Endpoint de token: GET com query, para ver se devolve um token.
    { nome: "GET token query", url: `${base}/token${credQuery}`, method: "GET", headers: jsonHeaders },
    { nome: "GET autenticar query", url: `${base}/usuarios/autenticar${credQuery}`, method: "GET", headers: jsonHeaders },
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
        resposta: text.slice(0, 200),
      });
    } catch (err) {
      resultados.push({ nome: t.nome, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const t of extras) {
    try {
      const res = await fetch(t.url, { method: t.method, headers: t.headers, body: t.rawBody });
      const text = await res.text();
      resultados.push({ nome: t.nome, endpoint: t.url.replace(base, ""), method: t.method, enviou: "extra", status: res.status, resposta: text.slice(0, 200) });
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

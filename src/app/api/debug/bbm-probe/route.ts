import { ok, fail } from "@/lib/api";
import { getBbmConfig } from "@/lib/services/freight/bbm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico: testa endpoints/formatos de autenticação da BBM/Translovato para
// descobrir como a API espera receber login e cotação (não há manual).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const c = getBbmConfig();
  const base = c.apiBaseUrl;
  const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  const formHeaders = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const cred = { usuario: c.usuario, senha: c.senha };
  const credForm = `usuario=${encodeURIComponent(c.usuario)}&senha=${encodeURIComponent(c.senha)}`;

  const tentativas: Array<{ nome: string; url: string; method: string; headers: Record<string, string>; body?: string }> = [
    // Login (JSON e form)
    { nome: "POST /login json", url: `${base}/login`, method: "POST", headers: jsonHeaders, body: JSON.stringify(cred) },
    { nome: "POST /login form", url: `${base}/login`, method: "POST", headers: formHeaders, body: credForm },
    { nome: "POST /autenticar json", url: `${base}/autenticar`, method: "POST", headers: jsonHeaders, body: JSON.stringify(cred) },
    { nome: "POST /auth json", url: `${base}/auth`, method: "POST", headers: jsonHeaders, body: JSON.stringify(cred) },
    { nome: "GET /login?query", url: `${base}/login?usuario=${encodeURIComponent(c.usuario)}&senha=${encodeURIComponent(c.senha)}`, method: "GET", headers: jsonHeaders },
    // Cotação (com credenciais no corpo)
    { nome: "POST /cotacao json", url: `${base}/cotacao`, method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...cred, cepDestino: "01001000", cepOrigem: c.cepOrigem }) },
    { nome: "POST /cotacoes json", url: `${base}/cotacoes`, method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...cred, cepDestino: "01001000" }) },
    { nome: "POST /frete json", url: `${base}/frete`, method: "POST", headers: jsonHeaders, body: JSON.stringify({ ...cred, cepDestino: "01001000" }) },
    // Raiz (descobrir se a API responde e o formato)
    { nome: "GET base", url: base, method: "GET", headers: jsonHeaders },
    { nome: "GET base/", url: `${base}/`, method: "GET", headers: jsonHeaders },
  ];

  const resultados = [];
  for (const t of tentativas) {
    try {
      const res = await fetch(t.url, { method: t.method, headers: t.headers, body: t.body });
      const text = await res.text();
      resultados.push({
        nome: t.nome,
        status: res.status,
        contentType: res.headers.get("content-type"),
        resposta: text.slice(0, 250),
      });
    } catch (err) {
      resultados.push({ nome: t.nome, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  return ok({ base, temUsuario: Boolean(c.usuario), temSenha: Boolean(c.senha), resultados });
}

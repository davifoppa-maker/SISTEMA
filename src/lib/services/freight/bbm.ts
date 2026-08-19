/**
 * Integração com a API da BBM Logística (transportadora Translovato).
 * Doc: https://tecnologia.bbmlogistica.com.br/docs/api/api-de-autenticacao-bbm-logistica
 *
 * ⚠️ IMPORTANTE: esta API é de PÓS-ENVIO (ocorrências, comprovantes, notfis e
 * webhooks). Ela NÃO possui endpoint de cotação/simulação de frete — por isso a
 * BBM fica marcada como `quotable: false` no registry e não aparece na tela de
 * cotação automática. A cotação da Translovato continua manual.
 *
 * Fluxo de autenticação (para rastreio/ocorrências, quando implementado):
 *   POST {base}/auth/token  { username, password, cnpj, force }
 *   → { token, token_type: "Bearer", validity: "05:59:59", ... }  (JWT ~6h)
 *   Depois: Authorization: Bearer <token> nas demais chamadas.
 *
 * Credenciais via variáveis de ambiente (nunca no código — repo público):
 *   BBM_USUARIO / BBM_SENHA / BBM_CNPJ  — para gerar o token
 *   BBM_TOKEN  — (opcional) JWT já pronto, usado direto se informado
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";

// Produção: https://app.bbmlogistica.com.br/api  ·  Homologação: app-dev...
const API_BASE = (process.env.BBM_API_BASE_URL || "https://app.bbmlogistica.com.br/api").replace(/\/$/, "");

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getBbmConfig() {
  return {
    usuario: process.env.BBM_USUARIO || "",
    senha: process.env.BBM_SENHA || "",
    token: process.env.BBM_TOKEN || "", // JWT pronto (opcional)
    // CNPJ autorizado na BBM (remetente). Default: NRX.
    cnpj: onlyDigits(process.env.BBM_CNPJ || process.env.BBM_CNPJ_REMETENTE || "51579683000114"),
    apiBaseUrl: API_BASE,
  };
}

export function isBbmConfigured(): boolean {
  const c = getBbmConfig();
  return Boolean(c.token || (c.usuario && c.senha && c.cnpj));
}

// Cache simples do JWT em memória (vale ~6h; renovamos com folga de 5 min).
let tokenCache: { token: string; exp: number } | null = null;

/**
 * Obtém um Bearer token válido. Usa BBM_TOKEN se fornecido; senão faz o
 * POST /auth/token documentado e cacheia o JWT.
 */
export async function getBbmToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const c = getBbmConfig();
  if (c.token) return { ok: true, token: c.token };
  if (!c.usuario || !c.senha || !c.cnpj) {
    return { ok: false, error: "BBM não configurada (defina BBM_USUARIO, BBM_SENHA e BBM_CNPJ)." };
  }
  if (tokenCache && tokenCache.exp > Date.now()) return { ok: true, token: tokenCache.token };

  try {
    const res = await fetch(`${c.apiBaseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: c.usuario, password: c.senha, cnpj: c.cnpj, force: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.token) {
      return { ok: false, error: `BBM auth ${res.status}: ${json?.message ?? "sem token"}` };
    }
    // validity vem como "HH:MM:SS"; cacheia com folga de 5 min.
    const [h = "0", m = "0", s = "0"] = String(json.validity ?? "05:59:59").split(":");
    const ms = ((Number(h) * 3600 + Number(m) * 60 + Number(s)) - 300) * 1000;
    tokenCache = { token: String(json.token), exp: Date.now() + Math.max(ms, 60_000) };
    return { ok: true, token: tokenCache.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (BBM auth)" };
  }
}

/**
 * A API da BBM/Translovato NÃO oferece cotação de frete. Retornamos um aviso
 * claro em vez de bater num endpoint inexistente (era o que causava o "BBM 404").
 * A BBM está marcada como `quotable: false` no registry, então nem chega aqui
 * pela tela — mantido por segurança caso alguém chame a rota direto.
 */
export async function quoteBbm(_params: QuoteParams): Promise<QuoteOutcome> {
  return {
    ok: false,
    error: "A API da BBM/Translovato não oferece cotação de frete (só rastreio, ocorrências e comprovantes). A cotação da Translovato é feita manualmente.",
  };
}

/**
 * Rastreio via BBM. A API expõe "comprovantes" e "ocorrências", mas o formato
 * exato de consulta por NF ainda precisa ser validado na doc de comprovantes.
 * Por ora autentica corretamente e retorna aviso claro se o endpoint não existir,
 * em vez de erro cru.
 */
export async function trackBbm(notaFiscal: string): Promise<TrackingOutcome> {
  const auth = await getBbmToken();
  if (!auth.ok) return { ok: false, error: auth.error };
  const c = getBbmConfig();
  try {
    const res = await fetch(`${c.apiBaseUrl}/comprovantes?nota_fiscal=${encodeURIComponent(notaFiscal)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${auth.token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `BBM rastreio ${res.status}: ${json?.message ?? ""}`.trim(), status: res.status, detail: json };
    }
    const data = json?.data ?? json;
    const ocorrencias: Array<{ data?: string; descricao?: string; local?: string }> =
      data.ocorrencias ?? data.eventos ?? data.timeline ?? [];
    return {
      ok: true,
      data: {
        shipments: [
          {
            status: data.status ?? data.situacao,
            numero: data.numero ?? notaFiscal,
            origem: data.origem,
            destino: data.destino,
            previsaoEntrega: data.previsaoEntrega ?? data.prazo,
            dataEntrega: data.dataEntrega,
            ultimaOcorrencia: ocorrencias[0]?.descricao,
            entregue: String(data.status ?? "").toLowerCase().includes("entregue"),
            timeline: ocorrencias.map((o) => ({ data: o.data, descricao: o.descricao, local: o.local })),
          },
        ],
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (BBM rastreio)" };
  }
}

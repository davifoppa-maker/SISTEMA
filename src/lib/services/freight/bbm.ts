/**
 * Integração com a API da BBM Logística (transportadora Translovato).
 * Doc: https://app.bbmlogistica.com.br/translovato/api
 *
 * ⚠️ BEST-EFFORT: o portal de docs exige login; implementamos o fluxo padrão
 * (token de acesso via header; cotação e rastreio em JSON). O parsing é tolerante
 * e guardamos a resposta crua — ao validar com a 1ª cotação real, ajustamos os
 * nomes de campos conforme a documentação.
 *
 * Credenciais via variáveis de ambiente:
 *   BBM_TOKEN     — token de acesso fornecido pela BBM
 *   BBM_USUARIO   — (opcional) usuário, se a API exigir
 *   BBM_SENHA     — (opcional) senha, se a API exigir
 *   BBM_CEP_ORIGEM / BBM_CNPJ_REMETENTE (opcionais; default p/ NRX)
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";

const API_BASE = (process.env.BBM_API_BASE_URL || "https://app.bbmlogistica.com.br/translovato/api").replace(/\/$/, "");

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getBbmConfig() {
  return {
    token: process.env.BBM_TOKEN || "",
    usuario: process.env.BBM_USUARIO || "",
    senha: process.env.BBM_SENHA || "",
    cepOrigem: onlyDigits(process.env.BBM_CEP_ORIGEM || process.env.BRASPRESS_CEP_ORIGEM || "88352501"),
    cnpjRemetente: onlyDigits(process.env.BBM_CNPJ_REMETENTE || process.env.BRASPRESS_CNPJ_REMETENTE || "51579683000114"),
    apiBaseUrl: API_BASE,
  };
}

export function isBbmConfigured(): boolean {
  const c = getBbmConfig();
  return Boolean(c.token || (c.usuario && c.senha));
}

function bbmHeaders(): Record<string, string> {
  const c = getBbmConfig();
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (c.token) h.Authorization = `Bearer ${c.token}`;
  return h;
}

export async function quoteBbm(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getBbmConfig();
  if (!isBbmConfigured()) {
    return { ok: false, error: "BBM/Translovato não configurada (defina BBM_TOKEN)." };
  }

  const cepDestino = onlyDigits(params.cepDestino);
  const cepOrigem = onlyDigits(params.cepOrigem) || c.cepOrigem;
  const cnpjRemetente = onlyDigits(params.cnpjRemetente) || c.cnpjRemetente;
  const cnpjDestinatario = onlyDigits(params.cnpjDestinatario);
  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };

  // Peso cubado: fator 300 kg/m³ (padrão rodoviário fracionado).
  const volumeM3 = (params.cubagem ?? []).reduce(
    (s, d) => s + d.altura * d.largura * d.comprimento * (d.volumes || 1),
    0,
  );
  const peso = Math.max(params.peso || 0, volumeM3 * 300);

  const body = {
    usuario: c.usuario || undefined,
    senha: c.senha || undefined,
    cnpjRemetente,
    cnpjDestinatario,
    cepOrigem,
    cepDestino,
    valorMercadoria: params.vlrMercadoria,
    peso: Number(peso.toFixed(3)),
    volumes: params.volumes || 1,
    cubagem: (params.cubagem ?? []).map((d) => ({
      altura: d.altura,
      largura: d.largura,
      comprimento: d.comprimento,
      quantidade: d.volumes,
    })),
  };

  try {
    const res = await fetch(`${c.apiBaseUrl}/cotacao`, {
      method: "POST",
      headers: bbmHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `BBM ${res.status}`, status: res.status, detail: json };
    const data = json?.data ?? json;
    const totalFrete = data.valorTotal ?? data.valorFrete ?? data.total ?? data.frete ?? null;
    const prazo = data.prazo ?? data.prazoEntrega ?? data.diasUteis ?? null;
    return {
      ok: true,
      data: {
        id: data.id ?? data.cotacaoId,
        totalFrete: totalFrete != null ? Number(totalFrete) : undefined,
        prazo: prazo != null ? Number(prazo) : undefined,
        validade: data.validade ?? undefined,
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (BBM)" };
  }
}

export async function trackBbm(notaFiscal: string): Promise<TrackingOutcome> {
  const c = getBbmConfig();
  if (!isBbmConfigured()) {
    return { ok: false, error: "BBM/Translovato não configurada." };
  }
  try {
    const res = await fetch(`${c.apiBaseUrl}/rastreio/${encodeURIComponent(notaFiscal)}`, {
      headers: bbmHeaders(),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `BBM rastreio ${res.status}`, status: res.status, detail: json };
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

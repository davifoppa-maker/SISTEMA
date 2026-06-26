/**
 * Integração com a API da Multitrans.
 *
 * Cotação: POST https://api.multitrans.com.br/api/cotacao (Bearer token)
 * Rastreio: GET  https://api.multitrans.com.br/api/rastreio/{nf}
 *
 * Credenciais via variáveis de ambiente:
 *   MULTITRANS_USUARIO   — usuário da conta
 *   MULTITRANS_TOKEN     — token de acesso
 *   MULTITRANS_SENHA     — senha da conta
 *   MULTITRANS_CEP_ORIGEM (opcional, padrão: mesmo do remetente)
 *   MULTITRANS_CNPJ_REMETENTE (opcional)
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";

const API_BASE = "https://api.multitrans.com.br/api";

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getMultitransConfig() {
  return {
    usuario: process.env.MULTITRANS_USUARIO || "",
    token: process.env.MULTITRANS_TOKEN || "",
    senha: process.env.MULTITRANS_SENHA || "",
    cepOrigem: onlyDigits(process.env.MULTITRANS_CEP_ORIGEM || process.env.BRASPRESS_CEP_ORIGEM || ""),
    cnpjRemetente: onlyDigits(process.env.MULTITRANS_CNPJ_REMETENTE || process.env.BRASPRESS_CNPJ_REMETENTE || ""),
  };
}

export function isMultitransConfigured(): boolean {
  const c = getMultitransConfig();
  return Boolean(c.token);
}

async function multitransFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const c = getMultitransConfig();
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${c.token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function quoteMultitrans(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getMultitransConfig();
  if (!c.token) {
    return { ok: false, error: "Multitrans não configurada (defina MULTITRANS_TOKEN)." };
  }

  const cepDestino = onlyDigits(params.cepDestino);
  const cepOrigem = onlyDigits(params.cepOrigem) || c.cepOrigem;
  const cnpjRemetente = onlyDigits(params.cnpjRemetente) || c.cnpjRemetente;
  const cnpjDestinatario = onlyDigits(params.cnpjDestinatario);

  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };

  // Peso cubado: fator 300 kg/m³ (padrão rodoviário fracionado)
  const volumeM3 = (params.cubagem ?? []).reduce(
    (s, d) => s + d.altura * d.largura * d.comprimento * (d.volumes || 1),
    0,
  );
  const pesoCubado = volumeM3 * 300;
  const peso = Math.max(params.peso || 0, pesoCubado);

  const body = {
    usuario: c.usuario,
    senha: c.senha,
    cepOrigem,
    cepDestino,
    cnpjRemetente,
    cnpjDestinatario,
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
    const res = await multitransFetch("/cotacao", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Multitrans ${res.status}`, status: res.status, detail: json };
    }
    // Normaliza a resposta — ajuste os campos conforme a documentação real da API
    const totalFrete =
      json.valorTotal ?? json.total ?? json.frete ?? json.valorFrete ?? null;
    const prazo = json.prazo ?? json.prazoEntrega ?? json.diasUteis ?? null;
    return {
      ok: true,
      data: {
        id: json.id ?? json.cotacaoId,
        totalFrete: totalFrete != null ? Number(totalFrete) : undefined,
        prazo: prazo != null ? Number(prazo) : undefined,
        validade: json.validade ?? undefined,
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Multitrans)" };
  }
}

export async function trackMultitrans(notaFiscal: string): Promise<TrackingOutcome> {
  const c = getMultitransConfig();
  if (!c.token) {
    return { ok: false, error: "Multitrans não configurada." };
  }
  try {
    const res = await multitransFetch(`/rastreio/${encodeURIComponent(notaFiscal)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Multitrans rastreio ${res.status}`, status: res.status, detail: json };
    }
    const ocorrencias: Array<{ data?: string; descricao?: string; local?: string }> =
      json.ocorrencias ?? json.eventos ?? json.timeline ?? [];
    return {
      ok: true,
      data: {
        shipments: [
          {
            status: json.status ?? json.situacao,
            numero: json.numero ?? notaFiscal,
            origem: json.origem,
            destino: json.destino,
            previsaoEntrega: json.previsaoEntrega ?? json.prazo,
            dataEntrega: json.dataEntrega,
            ultimaOcorrencia: ocorrencias[0]?.descricao,
            entregue: String(json.status ?? "").toLowerCase().includes("entregue"),
            timeline: ocorrencias.map((o) => ({
              data: o.data,
              descricao: o.descricao,
              local: o.local,
            })),
          },
        ],
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Multitrans rastreio)" };
  }
}

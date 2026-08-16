/**
 * Integração Expresso São Miguel (ESM).
 *
 * Bases (portas fora do padrão!):
 *   Cotação: https://wsintegcli01.expressosaomiguel.com.br:40504
 *   Rastreio: https://wsintegcli02.expressosaomiguel.com.br:40504  (host 02)
 * Auth: headers fixos ACCESS_KEY, CUSTOMER (CNPJ só dígitos), VERSION.
 *
 * ⚠️ RATE LIMIT 20 req/min → 401 + bloqueio de 30 min. O 401 é ambíguo
 * (chave errada OU rate limit). A cotação exige o código IBGE do destino.
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome, TrackingShipment } from "@/lib/services/freight/types";
import { freightFetch, parseJsonSafe, onlyDigits, cepToIbge, totalM3 } from "@/lib/services/freight/http";

const COTACAO_BASE = (process.env.ESM_COTACAO_URL || "https://wsintegcli01.expressosaomiguel.com.br:40504").replace(/\/$/, "");
const TRACKING_BASE = (process.env.ESM_TRACKING_URL || "https://wsintegcli02.expressosaomiguel.com.br:40504").replace(/\/$/, "");

export function getEsmConfig() {
  return {
    customer: onlyDigits(process.env.ESM_CUSTOMER || ""),
    accessKey: process.env.ESM_ACCESS_KEY || "",
    version: process.env.ESM_VERSION || "2.2",
  };
}

export function isEsmConfigured(): boolean {
  const c = getEsmConfig();
  return Boolean(c.customer && c.accessKey);
}

function headers() {
  const c = getEsmConfig();
  return { ACCESS_KEY: c.accessKey, CUSTOMER: c.customer, VERSION: c.version };
}

/** Data de hoje em DD/MM/AAAA (fuso Brasil). */
function hojeBr(): string {
  const d = new Date();
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function quoteEsm(params: QuoteParams): Promise<QuoteOutcome> {
  if (!isEsmConfigured()) {
    return { ok: false, error: "Expresso São Miguel não configurado (ESM_CUSTOMER, ESM_ACCESS_KEY)." };
  }
  const cepDestino = onlyDigits(params.cepDestino);
  if (cepDestino.length !== 8) return { ok: false, error: "CEP de destino inválido." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe a cubagem." };

  const ibge = await cepToIbge(cepDestino);
  if (!ibge) return { ok: false, error: "ESM: não resolveu o código IBGE do CEP de destino." };

  const docDest = onlyDigits(params.cnpjDestinatario);
  const body = {
    tipoPagoPagar: "P",
    codigoCidadeDestino: Number(ibge),
    quantidadeMercadoria: params.volumes || params.cubagem.reduce((s, d) => s + (d.volumes || 1), 0) || 1,
    pesoMercadoria: Number((params.peso || 0).toFixed(3)),
    cubagemMercadoria: Number(totalM3(params.cubagem).toFixed(4)),
    valorMercadoria: params.vlrMercadoria,
    clienteDestino: docDest,
    dataEmbarque: hojeBr(),
    tipoPessoaDestino: docDest.length === 11 ? "F" : "J",
  };

  try {
    const { res, text } = await freightFetch(`${COTACAO_BASE}/wsservernet/rest/frete/buscar/cliente`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      return { ok: false, error: "ESM: 401 (chave inválida OU rate limit de 20/min — aguarde alguns minutos)." };
    }
    const j = parseJsonSafe<any>(text);
    if (!res.ok) return { ok: false, error: j?.mensagem || `Erro ${res.status} na ESM`, status: res.status, detail: j ?? text };

    // HTTP 200 pode vir com status "erro" no corpo.
    const valorFrete = j?.valorFrete ?? j?.valor;
    if ((j?.status && j.status !== "ok") || valorFrete == null) {
      return { ok: false, error: j?.mensagem || "ESM não retornou o valor do frete.", detail: j ?? text };
    }

    // Prazo: calcula em dias a partir da previsaoEntrega "DD/MM/AAAA HH:mm".
    let prazo: number | undefined;
    const prev = String(j?.previsaoEntrega ?? "");
    const m = prev.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) {
      const alvo = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const diff = Math.ceil((alvo.getTime() - Date.now()) / 86_400_000);
      if (diff >= 0) prazo = diff;
    }

    return { ok: true, data: { totalFrete: Number(valorFrete), prazo, raw: j } };
  } catch (err) {
    return { ok: false, error: `Falha ao cotar ESM: ${(err as Error).message}` };
  }
}

const ENTREGUE_CODS = new Set(["EN", "01", "1"]);

export async function trackEsm(notaFiscal: string, cnpjDestinatario?: string): Promise<TrackingOutcome> {
  if (!isEsmConfigured()) return { ok: false, error: "Expresso São Miguel não configurado." };
  const nf = onlyDigits(notaFiscal);
  if (!nf) return { ok: false, error: "Número da NF ausente." };
  const doc = onlyDigits(cnpjDestinatario ?? "");

  try {
    const { res, text } = await freightFetch(`${TRACKING_BASE}/wsservernet/api/tracking`, {
      method: "POST",
      headers: {
        ...headers(),
        Modelo_Consulta: "TRACKING_COMPLETO_POR_NOTA_FISCAL_E_COMPROVANTE",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ valoresParametros: [doc, Number(nf), null] }),
    });
    if (res.status === 401) return { ok: false, error: "ESM: 401 (chave inválida ou rate limit)." };
    const j = parseJsonSafe<any>(text);
    if (!res.ok) return { ok: false, error: j?.mensagem || `Erro ${res.status}`, status: res.status, detail: j ?? text };

    const ocorrencias: any[] = j?.ocorrencias ?? j?.[0]?.ocorrencias ?? [];
    const entregue = ocorrencias.some(
      (o) => ENTREGUE_CODS.has(String(o?.codigoProceda)) || /entregue|entrega realizada/i.test(String(o?.descricaoOcorrencia ?? "")),
    );
    const shipment: TrackingShipment = {
      status: String(ocorrencias[ocorrencias.length - 1]?.descricaoOcorrencia ?? "—"),
      numero: nf,
      entregue,
      timeline: ocorrencias.map((o) => ({
        data: o?.dataRegistro ? String(o.dataRegistro) : undefined,
        descricao: String(o?.descricaoOcorrencia ?? ""),
        local: o?.unidade ? String(o.unidade) : undefined,
      })),
    };
    return { ok: true, data: { shipments: [shipment], raw: j } };
  } catch (err) {
    return { ok: false, error: `Falha ao rastrear ESM: ${(err as Error).message}` };
  }
}

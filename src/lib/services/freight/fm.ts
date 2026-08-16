/**
 * Integração FM Transportes.
 * Base: https://integration.fmtransportes.com.br/api  — Auth HTTP Basic.
 *
 * Cotação: POST /v1/quote  (origem implícita pelo contrato do CNPJ).
 * Rastreio: POST /v1/tracking — devolve a FILA do CNPJ INTEIRO (~500), você
 * filtra local pelo pedido. Erro de app vem como HTTP 200 com success:false.
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome, TrackingShipment } from "@/lib/services/freight/types";
import { freightFetch, parseJsonSafe, onlyDigits } from "@/lib/services/freight/http";

const BASE = (process.env.FMTRANSPORTES_API_BASE_URL || "https://integration.fmtransportes.com.br/api").replace(/\/$/, "");

export function getFmConfig() {
  return {
    user: process.env.FMTRANSPORTES_USER || "",
    password: process.env.FMTRANSPORTES_PASSWORD || "",
    cnpj: onlyDigits(process.env.FMTRANSPORTES_CNPJ || ""),
  };
}

export function isFmConfigured(): boolean {
  const c = getFmConfig();
  return Boolean(c.user && c.password && c.cnpj);
}

function basicHeader(): string {
  const c = getFmConfig();
  return "Basic " + Buffer.from(`${c.user}:${c.password}`).toString("base64");
}

// Status numéricos de entrega/finalização (guia).
const STATUS_ENTREGUE = new Set([1, 90]);

export async function quoteFm(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getFmConfig();
  if (!isFmConfigured()) {
    return { ok: false, error: "FM Transportes não configurada (FMTRANSPORTES_USER, FMTRANSPORTES_PASSWORD, FMTRANSPORTES_CNPJ)." };
  }
  const cepDestino = onlyDigits(params.cepDestino);
  if (cepDestino.length !== 8) return { ok: false, error: "CEP de destino inválido." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe a cubagem." };

  // 1 item POR CAIXA (expande as dimensões pela quantidade de volumes), em cm.
  const volumes: { length: number; height: number; width: number }[] = [];
  for (const d of params.cubagem) {
    const n = d.volumes || 1;
    for (let i = 0; i < n; i++) {
      volumes.push({
        length: Math.round(d.comprimento * 100),
        height: Math.round(d.altura * 100),
        width: Math.round(d.largura * 100),
      });
    }
  }

  const body = {
    clientDocument: c.cnpj,
    zipCodeDestination: Number(cepDestino),
    totalValue: params.vlrMercadoria,
    totalWeight: Number((params.peso || 0).toFixed(3)),
    volumes,
  };

  try {
    const { res, text } = await freightFetch(`${BASE}/v1/quote`, {
      method: "POST",
      headers: { Authorization: basicHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }, 30000);
    if (res.status === 204) return { ok: false, error: "FM: sem serviço para esta rota." };
    const j = parseJsonSafe<any>(text);
    if (!res.ok) return { ok: false, error: j?.message || `Erro ${res.status} na FM`, status: res.status, detail: j ?? text };

    const servicos: any[] = Array.isArray(j) ? j : Array.isArray(j?.services) ? j.services : j ? [j] : [];
    const opcoes = servicos
      .map((s) => ({ preco: Number(s?.value ?? s?.price ?? s?.totalValue), prazo: s?.deliveryTime, code: s?.code ?? s?.serviceCode, raw: s }))
      .filter((o) => Number.isFinite(o.preco) && o.preco > 0);
    if (opcoes.length === 0) return { ok: false, error: "FM não retornou serviço com preço.", detail: j ?? text };

    opcoes.sort((a, b) => a.preco - b.preco);
    const melhor = opcoes[0];
    return {
      ok: true,
      data: { totalFrete: melhor.preco, prazo: melhor.prazo != null ? Number(melhor.prazo) : undefined, id: melhor.code, raw: { opcoes } },
    };
  } catch (err) {
    return { ok: false, error: `Falha ao cotar FM: ${(err as Error).message}` };
  }
}

export async function trackFm(identificador: string): Promise<TrackingOutcome> {
  const c = getFmConfig();
  if (!isFmConfigured()) return { ok: false, error: "FM Transportes não configurada." };
  const alvo = String(identificador || "").trim().toLowerCase();
  if (!alvo) return { ok: false, error: "Identificador ausente." };

  try {
    const { res, text } = await freightFetch(`${BASE}/v1/tracking`, {
      method: "POST",
      headers: { Authorization: basicHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clientDocument: c.cnpj }),
    }, 30000);
    const j = parseJsonSafe<any>(text);
    if (!res.ok) return { ok: false, error: j?.message || `Erro ${res.status}`, status: res.status, detail: j ?? text };
    if (j?.success === false) return { ok: false, error: j?.message || "FM: falha de aplicação (success=false).", detail: j };

    const lote: any[] = Array.isArray(j?.trackings) ? j.trackings : Array.isArray(j) ? j : [];
    const alvoDigits = onlyDigits(alvo);
    // Filtra local (case-insensitive) por código, NF ou chave.
    const match = lote.filter((t) => {
      const ids = [t?.trackingCode, t?.orderNumber, t?.fiscalNoteNumber, t?.fiscalNoteAccessKey]
        .map((v) => String(v ?? "").toLowerCase());
      return ids.some((v) => v === alvo || (alvoDigits && onlyDigits(v) === alvoDigits));
    });
    if (match.length === 0) return { ok: true, data: { shipments: [], raw: { total: lote.length } } };

    const shipments: TrackingShipment[] = match.map((t) => {
      const st = Number(t?.status);
      const eventos: any[] = Array.isArray(t?.events) ? t.events : [];
      return {
        status: String(t?.statusDescription ?? st),
        numero: String(t?.fiscalNoteNumber ?? t?.trackingCode ?? ""),
        entregue: STATUS_ENTREGUE.has(st),
        timeline: eventos.map((e) => ({
          data: e?.date ? String(e.date) : undefined,
          descricao: String(e?.description ?? e?.status ?? ""),
          local: e?.city ? String(e.city) : undefined,
        })),
      };
    });
    return { ok: true, data: { shipments, raw: { matched: match.length, total: lote.length } } };
  } catch (err) {
    return { ok: false, error: `Falha ao rastrear FM: ${(err as Error).message}` };
  }
}

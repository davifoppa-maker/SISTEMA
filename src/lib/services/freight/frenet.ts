/**
 * Integração com a FRENET (gateway de fretes: Correios, Jadlog, Loggi, etc.).
 * Doc: https://frenet.com.br (API pública) — POST api.frenet.com.br/shipping/quote
 * Autenticação: header `token` (gerado no painel.frenet.com.br).
 *
 * A Frenet devolve VÁRIAS transportadoras numa chamada; aqui retornamos a MAIS
 * BARATA (as demais ficam no `raw` para exibição futura).
 *
 * Env: FRENET_TOKEN (obrigatório) · FRENET_CEP_ORIGEM (default Brusque).
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";

const API = "https://api.frenet.com.br";

const onlyDigits = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "");

export function getFrenetConfig() {
  return {
    token: process.env.FRENET_TOKEN || "",
    cepOrigem: onlyDigits(process.env.FRENET_CEP_ORIGEM || "88352501"),
  };
}

export function isFrenetConfigured(): boolean {
  return Boolean(getFrenetConfig().token);
}

export async function quoteFrenet(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getFrenetConfig();
  if (!c.token) return { ok: false, error: "Frenet não configurada (defina FRENET_TOKEN)." };
  const cepDestino = onlyDigits(params.cepDestino);
  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };

  // Itens: uma linha por dimensão de cubagem (peso rateado por volume).
  const cubagem = (params.cubagem ?? []).filter((d) => d.altura > 0 && d.largura > 0 && d.comprimento > 0);
  const totalVol = cubagem.reduce((s, d) => s + (d.volumes || 1), 0) || params.volumes || 1;
  const pesoPorVol = (params.peso || 0.3) / totalVol;
  const itens = (cubagem.length > 0 ? cubagem : [{ altura: 0.1, largura: 0.15, comprimento: 0.2, volumes: params.volumes || 1 }])
    .map((d) => ({
      Height: Math.max(1, Math.round(d.altura * 100)),
      Length: Math.max(1, Math.round(d.comprimento * 100)),
      Width: Math.max(1, Math.round(d.largura * 100)),
      Weight: Math.max(0.05, Number((pesoPorVol).toFixed(3))),
      Quantity: d.volumes || 1,
    }));

  try {
    const res = await fetch(`${API}/shipping/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token: c.token },
      body: JSON.stringify({
        SellerCEP: onlyDigits(params.cepOrigem) || c.cepOrigem,
        RecipientCEP: cepDestino,
        ShipmentInvoiceValue: params.vlrMercadoria || 0,
        ShippingServiceCode: null,
        RecipientCountry: "BR",
        ShippingItemArray: itens,
      }),
    });
    const json = await res.json().catch(() => null) as any;
    if (!res.ok) return { ok: false, error: `Frenet ${res.status}: ${JSON.stringify(json).slice(0, 200)}`, status: res.status };
    // Sim, o nome do campo tem typo NA PRÓPRIA API: "ShippingSevicesArray".
    const servicos: any[] = json?.ShippingSevicesArray ?? json?.ShippingServicesArray ?? [];
    const validos = servicos
      .filter((s) => !s.Error && Number(s.ShippingPrice) > 0)
      .map((s) => ({
        transportadora: s.Carrier ?? s.ServiceDescription,
        servico: s.ServiceDescription,
        codigo: s.ServiceCode,
        preco: Number(s.ShippingPrice),
        prazoDias: Number(s.DeliveryTime) || null,
      }))
      .sort((a, b) => a.preco - b.preco);
    if (validos.length === 0) {
      const erroApi = servicos.find((s) => s.Error)?.Msg ?? "Nenhum serviço disponível para este destino.";
      return { ok: false, error: `Frenet: ${erroApi}` };
    }
    const melhor = validos[0];
    return {
      ok: true,
      data: {
        id: melhor.codigo,
        totalFrete: melhor.preco,
        prazo: melhor.prazoDias ?? undefined,
        raw: { melhor, opcoes: validos, resposta: json },
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Frenet)" };
  }
}

export async function trackFrenet(codigoRastreio: string): Promise<TrackingOutcome> {
  const c = getFrenetConfig();
  if (!c.token) return { ok: false, error: "Frenet não configurada." };
  try {
    const res = await fetch(`${API}/tracking/trackinginfo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", token: c.token },
      body: JSON.stringify({ TrackingNumber: codigoRastreio, ShippingServiceCode: null }),
    });
    const json = await res.json().catch(() => null) as any;
    if (!res.ok) return { ok: false, error: `Frenet rastreio ${res.status}`, status: res.status, detail: json };
    const eventos: any[] = json?.TrackingEvents ?? [];
    return {
      ok: true,
      data: {
        shipments: [{
          numero: codigoRastreio,
          status: eventos[0]?.EventDescription,
          ultimaOcorrencia: eventos[0]?.EventDescription,
          entregue: eventos.some((e) => /entreg/i.test(String(e.EventDescription ?? ""))),
          timeline: eventos.map((e) => ({ data: e.EventDateTime, descricao: e.EventDescription, local: e.EventLocation })),
        }],
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Frenet rastreio)" };
  }
}

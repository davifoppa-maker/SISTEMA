/**
 * Integração Rodonaves (RTE).
 * Doc: https://dev.rodonaves.com.br/
 *
 * São 3 gateways, cada um com SEU token (OAuth password):
 *   Cotação: https://quotation-apigateway.rte.com.br
 *   Rastreio: https://tracking-apigateway.rte.com.br
 *   CEP→cidade (DNE): https://dne-api.rte.com.br  (usa token do gateway de cotação)
 *
 * Pegadinha nº1 (do guia): a cotação EXIGE o CityId do DNE — não aceita só CEP.
 * Grafias tortas são DA API: EletronicInvoiceValue (um "l"), ReceiverCpfcnp.
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome, TrackingShipment } from "@/lib/services/freight/types";
import { freightFetch, parseJsonSafe, onlyDigits } from "@/lib/services/freight/http";

const GW = {
  quotation: (process.env.RODONAVES_QUOTATION_URL || "https://quotation-apigateway.rte.com.br").replace(/\/$/, ""),
  tracking: (process.env.RODONAVES_TRACKING_URL || "https://tracking-apigateway.rte.com.br").replace(/\/$/, ""),
  dne: (process.env.RODONAVES_DNE_URL || "https://dne-api.rte.com.br").replace(/\/$/, ""),
};

export function getRodonavesConfig() {
  return {
    username: process.env.RODONAVES_USERNAME || "",
    password: process.env.RODONAVES_PASSWORD || "",
    authType: process.env.RODONAVES_AUTH_TYPE || "DEV",
    cnpj: onlyDigits(process.env.RODONAVES_CNPJ || ""),
    cepOrigem: onlyDigits(process.env.RODONAVES_CEP_ORIGEM || "88352501"),
    contactName: process.env.RODONAVES_CONTACT_NAME || "NYER",
    contactPhone: process.env.RODONAVES_CONTACT_PHONE || "(48) 0000-0000",
  };
}

export function isRodonavesConfigured(): boolean {
  const c = getRodonavesConfig();
  return Boolean(c.username && c.password && c.cnpj);
}

// Token por gateway (cache em memória).
const tokenCache = new Map<string, { token: string; exp: number }>();

async function getToken(gateway: string): Promise<string> {
  const cached = tokenCache.get(gateway);
  if (cached && cached.exp - 60_000 > Date.now()) return cached.token;
  const c = getRodonavesConfig();
  const body = new URLSearchParams({
    auth_type: c.authType,
    grant_type: "password",
    username: c.username,
    password: c.password,
  });
  const { res, text } = await freightFetch(`${gateway}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j = parseJsonSafe<{ access_token?: string; expires_in?: number }>(text);
  if (!res.ok || !j?.access_token) throw new Error(`Rodonaves token ${res.status}: ${text.slice(0, 200)}`);
  const exp = Date.now() + (Number(j.expires_in) || 3600) * 1000;
  tokenCache.set(gateway, { token: j.access_token, exp });
  return j.access_token;
}

// CityId do DNE por CEP (cache).
const cityCache = new Map<string, number>();

async function getCityId(cep: string): Promise<number | null> {
  const c = onlyDigits(cep);
  if (c.length !== 8) return null;
  if (cityCache.has(c)) return cityCache.get(c)!;
  const token = await getToken(GW.quotation);
  const { res, text } = await freightFetch(`${GW.dne}/api/cities/byzipcode?zipCode=${c}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const j = parseJsonSafe<any>(text);
  if (!res.ok) return null;
  const id = j?.cityId ?? j?.CityId ?? j?.id ?? (Array.isArray(j) ? j[0]?.cityId ?? j[0]?.CityId ?? j[0]?.id : null);
  if (id != null) {
    cityCache.set(c, Number(id));
    return Number(id);
  }
  return null;
}

export async function quoteRodonaves(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getRodonavesConfig();
  if (!isRodonavesConfigured()) {
    return { ok: false, error: "Rodonaves não configurada (RODONAVES_USERNAME, RODONAVES_PASSWORD, RODONAVES_CNPJ)." };
  }
  const cepOrigem = onlyDigits(params.cepOrigem) || c.cepOrigem;
  const cepDestino = onlyDigits(params.cepDestino);
  if (cepDestino.length !== 8) return { ok: false, error: "CEP de destino inválido." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe a cubagem." };

  try {
    const [origCity, destCity] = await Promise.all([getCityId(cepOrigem), getCityId(cepDestino)]);
    if (!origCity || !destCity) {
      return { ok: false, error: "Rodonaves: não resolveu a cidade (DNE) do CEP de origem/destino." };
    }

    const totalVolumes = params.cubagem.reduce((s, d) => s + (d.volumes || 1), 0) || 1;
    const packs = params.cubagem.map((d) => ({
      AmountPackages: d.volumes || 1,
      Weight: Number(((params.peso || 0) / totalVolumes).toFixed(3)), // peso rateado por volume
      Length: Math.round(d.comprimento * 100), // cm
      Height: Math.round(d.altura * 100),
      Width: Math.round(d.largura * 100),
    }));

    const body = {
      OriginZipCode: cepOrigem,
      OriginCityId: origCity,
      DestinationZipCode: cepDestino,
      DestinationCityId: destCity,
      TotalWeight: Number((params.peso || 0).toFixed(3)),
      EletronicInvoiceValue: params.vlrMercadoria, // grafia da API (um "l")
      CustomerTaxIdRegistration: c.cnpj,
      ReceiverCpfcnp: onlyDigits(params.cnpjDestinatario), // grafia da API
      Packs: packs,
      ContactName: c.contactName,
      ContactPhoneNumber: c.contactPhone,
    };

    const token = await getToken(GW.quotation);
    const { res, text } = await freightFetch(`${GW.quotation}/api/v1/gera-cotacao`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const j = parseJsonSafe<any>(text);
    if (!res.ok) {
      return { ok: false, error: j?.Message || j?.message || `Erro ${res.status} na Rodonaves`, status: res.status, detail: j ?? text };
    }
    const valor = j?.Value ?? j?.value;
    if (valor == null) return { ok: false, error: j?.Message || "Rodonaves não retornou o valor.", detail: j ?? text };
    return {
      ok: true,
      data: {
        totalFrete: Number(valor),
        prazo: j?.DeliveryTime != null ? Number(j.DeliveryTime) : undefined,
        id: j?.ProtocolNumber,
        validade: j?.ExpirationDay ? String(j.ExpirationDay) : undefined,
        raw: j,
      },
    };
  } catch (err) {
    return { ok: false, error: `Falha ao cotar Rodonaves: ${(err as Error).message}` };
  }
}

const ENTREGUE_RE = /entregue|entrega realizada|mercadoria entregue|mercadoria retirada \(recebedor/i;

export async function trackRodonaves(notaFiscal: string): Promise<TrackingOutcome> {
  const c = getRodonavesConfig();
  if (!isRodonavesConfigured()) return { ok: false, error: "Rodonaves não configurada." };
  const nf = onlyDigits(notaFiscal);
  if (!nf) return { ok: false, error: "Número da NF ausente." };
  try {
    const token = await getToken(GW.tracking);
    const { res, text } = await freightFetch(
      `${GW.tracking}/api/v1/tracking?TaxIdRegistration=${c.cnpj}&InvoiceNumber=${nf}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    const j = parseJsonSafe<any>(text);
    if (!res.ok) return { ok: false, error: j?.Message || `Erro ${res.status}`, status: res.status, detail: j ?? text };

    const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.Tracking) ? j.Tracking : j ? [j] : [];
    const shipments: TrackingShipment[] = arr.map((it) => {
      const eventos: any[] = it?.Events ?? it?.events ?? it?.TrackingEvents ?? it?.Ocorrencias ?? it?.History ?? [];
      // Rodonaves: ordem CRESCENTE (último = mais novo).
      const ultimo = eventos[eventos.length - 1];
      const entregue =
        it?.Delivered === true ||
        String(it?.ProcedaCode) === "1" ||
        eventos.some((e) => ENTREGUE_RE.test(String(e?.Description ?? e?.descricao ?? e?.Status ?? "")));
      return {
        status: String(ultimo?.Description ?? ultimo?.descricao ?? it?.Status ?? "—"),
        numero: String(onlyDigits(it?.FiscalDocumentNumber ?? nf)),
        entregue,
        previsaoEntrega: it?.EstimatedDeliveryDate ? String(it.EstimatedDeliveryDate) : undefined,
        dataEntrega: it?.DeliveryDate ? String(it.DeliveryDate) : undefined,
        timeline: eventos.map((e) => ({
          data: e?.Date ? String(e.Date) : e?.data ? String(e.data) : undefined,
          descricao: String(e?.Description ?? e?.descricao ?? e?.Status ?? ""),
          local: e?.City ? `${e.City}/${e.State ?? ""}` : undefined,
        })),
      };
    });
    return { ok: true, data: { shipments, raw: j } };
  } catch (err) {
    return { ok: false, error: `Falha ao rastrear Rodonaves: ${(err as Error).message}` };
  }
}

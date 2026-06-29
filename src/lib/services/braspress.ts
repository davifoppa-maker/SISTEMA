/**
 * Integração com a API da Braspress (cotação de frete e rastreio).
 * Doc: https://api.braspress.com/
 *
 * Autenticação: Basic Auth (usuário + senha fornecidos pela Braspress).
 * Credenciais e dados do remetente ficam em variáveis de ambiente — nunca no código.
 *
 * Os tipos genéricos vivem em `freight/types.ts`; aqui é só a implementação Braspress.
 */

import type {
  QuoteParams,
  QuoteOutcome,
  TrackingShipment,
  TrackingOutcome,
} from "@/lib/services/freight/types";

const BRASPRESS_API_BASE = process.env.BRASPRESS_API_BASE_URL || "https://api.braspress.com";

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

// CNPJ de origem por empresa (públicos; usuário/senha vêm só de env vars).
const CNPJ_PADRAO: Record<string, string> = {
  nyer: "51579683000114",
  ecopro: "54369810000149",
};

/**
 * Config da Braspress por empresa. NYER e Ecopro têm contratos/credenciais
 * distintos na Braspress. Para a Ecopro, defina as env vars com prefixo
 * `ECOPRO_` (ECOPRO_BRASPRESS_USER, ECOPRO_BRASPRESS_PASSWORD, ...).
 */
export function getBraspressConfig(companyId = "nyer") {
  const isEcopro = companyId === "ecopro";
  const prefix = isEcopro ? "ECOPRO_" : "";
  const cnpjPadrao = CNPJ_PADRAO[companyId] ?? CNPJ_PADRAO.nyer;
  return {
    user: process.env[`${prefix}BRASPRESS_USER`] || "",
    password: process.env[`${prefix}BRASPRESS_PASSWORD`] || "",
    cnpjRemetente: onlyDigits(process.env[`${prefix}BRASPRESS_CNPJ_REMETENTE`] || cnpjPadrao),
    cepOrigem: onlyDigits(process.env[`${prefix}BRASPRESS_CEP_ORIGEM`] || process.env.BRASPRESS_CEP_ORIGEM || "88352501"),
    apiBaseUrl: BRASPRESS_API_BASE.replace(/\/$/, ""),
  };
}

/** Há credenciais configuradas para chamar a Braspress? */
export function isBraspressConfigured(): boolean {
  const c = getBraspressConfig();
  return Boolean(c.user && c.password);
}

/** Cota o frete na Braspress. Retorna outcome (não lança) para a rota tratar o erro. */
export async function quoteFreight(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getBraspressConfig(params.empresa);
  if (!c.user || !c.password) {
    return { ok: false, error: "Braspress não configurada (defina BRASPRESS_USER e BRASPRESS_PASSWORD)." };
  }

  const cnpjDestinatario = onlyDigits(params.cnpjDestinatario);
  const cepDestino = onlyDigits(params.cepDestino);
  if (!cnpjDestinatario) return { ok: false, error: "CNPJ/CPF do destinatário ausente." };
  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe ao menos uma dimensão de volume (cubagem)." };

  const body = {
    cnpjRemetente: Number(onlyDigits(params.cnpjRemetente) || c.cnpjRemetente),
    cnpjDestinatario: Number(cnpjDestinatario),
    modal: params.modal || "R",
    tipoFrete: params.tipoFrete || "1",
    cepOrigem: Number(onlyDigits(params.cepOrigem) || c.cepOrigem),
    cepDestino: Number(cepDestino),
    vlrMercadoria: params.vlrMercadoria,
    peso: params.peso,
    volumes: params.volumes,
    cubagem: params.cubagem.map((d) => ({
      altura: d.altura,
      largura: d.largura,
      comprimento: d.comprimento,
      volumes: d.volumes,
    })),
  };

  const auth = Buffer.from(`${c.user}:${c.password}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/v1/cotacao/calcular/json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar a Braspress: ${(err as Error).message}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // resposta não-JSON (ex.: HTML de erro) — mantém o texto cru no detalhe
  }

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.errors?.[0]?.message ||
      (typeof json === "string" ? json : null) ||
      text ||
      `Erro ${res.status} na Braspress`;
    return { ok: false, error: String(msg), status: res.status, detail: json ?? text };
  }

  return {
    ok: true,
    data: {
      id: json?.id,
      prazo: json?.prazo,
      totalFrete: json?.totalFrete,
      validade: json?.validade,
      raw: json,
    },
  };
}

const str = (v: unknown): string | undefined =>
  v == null || v === "" ? undefined : String(v);

/** Normaliza um "conhecimento" da resposta da Braspress (tolerante a variações de nome). */
function normalizeShipment(c: any): TrackingShipment {
  const timelineRaw: any[] = Array.isArray(c?.timeLine)
    ? c.timeLine
    : Array.isArray(c?.timeline)
      ? c.timeline
      : Array.isArray(c?.ocorrencias)
        ? c.ocorrencias
        : [];
  return {
    status: str(c?.statusEntrega ?? c?.status ?? c?.situacao),
    numero: str(c?.numero ?? c?.numeroConhecimento ?? c?.numeroNotaFiscal),
    origem: str(c?.origem ?? c?.cidadeOrigem),
    destino: str(c?.destino ?? c?.cidadeDestino),
    previsaoEntrega: str(c?.previsaoEntrega ?? c?.dataPrevisaoEntrega),
    dataEntrega: str(c?.dataEntrega ?? c?.dataHoraEntrega),
    ultimaOcorrencia: str(c?.ultimaOcorrencia ?? c?.ultimaOcorrenciaDescricao),
    timeline: timelineRaw.map((e) => ({
      data: str(e?.data ?? e?.dataHora ?? e?.dataOcorrencia),
      descricao: str(e?.descricao ?? e?.ocorrencia ?? e?.status),
      local: str(e?.local ?? e?.cidade ?? e?.unidade),
    })),
  };
}

/**
 * Rastreia uma carga pela nota fiscal na Braspress.
 * GET /v1/tracking/{cnpjRemetente}/{notaFiscal}/json
 * Observação: a Braspress só retorna NFs dos últimos 90 dias (data de emissão).
 */
export async function trackByNf(notaFiscal: string, cnpj?: string): Promise<TrackingOutcome> {
  // Seleciona a empresa pelo CNPJ informado (cada conta tem credenciais próprias).
  const cnpjIn = onlyDigits(cnpj);
  const empresa = cnpjIn && cnpjIn === CNPJ_PADRAO.ecopro ? "ecopro" : "nyer";
  const c = getBraspressConfig(empresa);
  if (!c.user || !c.password) {
    return { ok: false, error: "Braspress não configurada (defina BRASPRESS_USER e BRASPRESS_PASSWORD)." };
  }
  const nf = onlyDigits(notaFiscal);
  const cnpjRem = cnpjIn || c.cnpjRemetente;
  if (!nf) return { ok: false, error: "Nota fiscal ausente." };

  const auth = Buffer.from(`${c.user}:${c.password}`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/v1/tracking/${cnpjRem}/${nf}/json`, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar a Braspress: ${(err as Error).message}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // resposta não-JSON
  }

  if (!res.ok) {
    if (res.status === 404) {
      return { ok: false, error: "Nada encontrado para essa nota (verifique o número e se a emissão foi nos últimos 90 dias).", status: 404 };
    }
    const msg =
      json?.message ||
      json?.errors?.[0]?.message ||
      (typeof json === "string" ? json : null) ||
      text ||
      `Erro ${res.status} na Braspress`;
    return { ok: false, error: String(msg), status: res.status, detail: json ?? text };
  }

  const conhecimentos: any[] = Array.isArray(json?.conhecimentos)
    ? json.conhecimentos
    : Array.isArray(json)
      ? json
      : json
        ? [json]
        : [];

  return {
    ok: true,
    data: { shipments: conhecimentos.map(normalizeShipment), raw: json },
  };
}

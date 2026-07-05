/**
 * Integração com a API REST da JadLog (embarcador).
 * Doc: http://www.jadlog.com.br/embarcador  (manual em integracoes.jadlog.com.br)
 *
 * Cotação:  POST /embarcador/api/frete/valor   (Bearer token)
 * Rastreio: POST /embarcador/api/tracking/consultar
 *
 * Escopo Arlete/NYER: cargas fracionadas (modalidade 3 = .Package). A JadLog já
 * inclui no total as taxas aplicáveis; o peso usado é o MAIOR entre o real e o
 * cubado (fator 300 kg/m³ para fracionado).
 *
 * Credenciais (token) ficam em variável de ambiente — nunca no código.
 */

import type {
  QuoteParams,
  QuoteOutcome,
  TrackingShipment,
  TrackingOutcome,
} from "@/lib/services/freight/types";

const JADLOG_API_BASE = process.env.JADLOG_API_BASE_URL || "https://www.jadlog.com.br";

/** Fator de cubagem para carga fracionada (kg por m³). */
const FATOR_CUBAGEM = 300;

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getJadlogConfig() {
  return {
    token: process.env.JADLOG_TOKEN || "",
    cnpj: onlyDigits(process.env.JADLOG_CNPJ || "51579683000114"),
    conta: process.env.JADLOG_CONTA || "123966",
    contrato: process.env.JADLOG_CONTRATO || "",
    modalidade: Number(process.env.JADLOG_MODALIDADE || "3"), // 3 = .Package
    cepOrigem: onlyDigits(process.env.JADLOG_CEP_ORIGEM || "88352501"),
    pontoEmissor: process.env.JADLOG_PONTO_EMISSOR || "0890",
    apiBaseUrl: JADLOG_API_BASE.replace(/\/$/, ""),
  };
}

export function isJadlogConfigured(): boolean {
  return Boolean(getJadlogConfig().token);
}

/** Cotação de frete na JadLog. */
export async function quoteJadlog(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getJadlogConfig();
  if (!c.token) {
    return { ok: false, error: "JadLog não configurada (defina JADLOG_TOKEN)." };
  }

  const cepdes = onlyDigits(params.cepDestino);
  if (!cepdes) return { ok: false, error: "CEP de destino ausente." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe ao menos uma dimensão de volume (cubagem)." };

  // Peso considerado = maior entre o real e o cubado (m³ × 300 kg, fracionado).
  const volumeM3 = params.cubagem.reduce(
    (sum, d) => sum + d.altura * d.largura * d.comprimento * (d.volumes || 1),
    0,
  );
  const pesoCubado = volumeM3 * FATOR_CUBAGEM;
  const peso = Math.max(params.peso || 0, pesoCubado);

  const body = {
    frete: [
      {
        cepori: onlyDigits(params.cepOrigem) || c.cepOrigem,
        cepdes,
        frap: "N",
        peso: Number(peso.toFixed(3)),
        cnpj: c.cnpj,
        conta: c.conta,
        contrato: c.contrato,
        modalidade: c.modalidade,
        tpentrega: "D", // D = entrega em domicílio
        tpseguro: "N", // N = seguro normal (Jadlog)
        vldeclarado: params.vlrMercadoria,
        vlcoleta: 0,
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/embarcador/api/frete/valor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${c.token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar a JadLog: ${(err as Error).message}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text || `Erro ${res.status} na JadLog`;
    return { ok: false, error: String(msg), status: res.status, detail: json ?? text };
  }

  const item = Array.isArray(json?.frete) ? json.frete[0] : json;
  // Erro por item (ex.: { error: { id, descricao } } ou { erro: "..." }).
  const itemErro =
    item?.error?.descricao ?? item?.erro?.descricao ?? item?.error ?? item?.erro ?? item?.mensagem;
  const vltotal = item?.vltotal ?? item?.valorFrete ?? item?.valor;

  if (vltotal == null) {
    const msg = typeof itemErro === "string" && itemErro ? itemErro : "JadLog não retornou o valor do frete.";
    return { ok: false, error: msg, status: 422, detail: json ?? text };
  }

  return {
    ok: true,
    data: {
      totalFrete: Number(vltotal),
      prazo: item?.prazo != null ? Number(item.prazo) : undefined,
      raw: json,
    },
  };
}

const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

// Status de entrega concluída na Jadlog (ex.: "ENTREGUE", "ENTREGA REALIZADA").
const JADLOG_ENTREGUE = /entreg(ue|a\s+realizada)/i;

/** Datas da Jadlog vêm como "AAAA-MM-DD HH:mm:ss"; normaliza para ISO. */
function normalizeJadlogDate(s?: string): string | undefined {
  if (!s) return undefined;
  const v = s.trim().replace(" ", "T");
  return v || undefined;
}

function normalizeJadlogShipment(d: any): TrackingShipment {
  // A consulta pode trazer os dados no item ou aninhados em `tracking`.
  const t = d?.tracking ?? d;
  const eventos: any[] = Array.isArray(t?.eventos)
    ? t.eventos
    : Array.isArray(d?.eventos)
      ? d.eventos
      : [];
  const erro = d?.erro?.descricao ?? d?.error?.descricao ?? d?.erro ?? d?.error;

  // Entrega: status geral "ENTREGUE" ou um evento de entrega na timeline.
  const eventoEntrega = eventos.find((e) => JADLOG_ENTREGUE.test(String(e?.status ?? e?.descricao ?? "")));
  const entregue = JADLOG_ENTREGUE.test(String(t?.status ?? "")) || Boolean(eventoEntrega);
  const dataEntrega =
    normalizeJadlogDate(str(t?.dataEntrega ?? t?.dtEntrega ?? d?.dataEntrega)) ??
    (entregue ? normalizeJadlogDate(str(eventoEntrega?.data ?? eventos[eventos.length - 1]?.data)) : undefined);

  return {
    status: str(t?.status ?? t?.situacao ?? d?.status) ?? (typeof erro === "string" ? `Não localizado: ${erro}` : undefined),
    entregue,
    numero: str(t?.nf ?? d?.nf ?? d?.shipmentId ?? d?.codigo ?? t?.codigo),
    origem: str(t?.origem ?? d?.origem),
    destino: str(t?.destino ?? d?.destino),
    previsaoEntrega: str(t?.previsaoEntrega ?? t?.dtPrevEntrega ?? d?.previsaoEntrega),
    dataEntrega,
    timeline: eventos.map((e) => ({
      data: normalizeJadlogDate(str(e?.data ?? e?.dtHora ?? e?.dataHora)),
      descricao: str(e?.status ?? e?.descricao ?? e?.evento),
      local: str(e?.unidade ?? e?.local ?? e?.cidade),
    })),
  };
}

/**
 * Rastreio JadLog — POST /embarcador/api/tracking/consultar.
 * A consulta é pelo `shipmentId` (= "Código de rastreamento" da expedição, ex.:
 * 12396600024828). NÃO funciona pelo número nem pela chave da NF-e — passe o
 * tracking_code da expedição. (Uma chave de 44 díg. é tentada via `nfe` como
 * último recurso, mas a Jadlog normalmente não localiza por ela.)
 */
export async function trackJadlog(identificador: string): Promise<TrackingOutcome> {
  const c = getJadlogConfig();
  if (!c.token) return { ok: false, error: "JadLog não configurada (defina JADLOG_TOKEN)." };
  const digits = onlyDigits(identificador);
  if (!digits) return { ok: false, error: "Identificador ausente (código de rastreio / shipmentId)." };
  // Código de rastreio (shipmentId) é o caminho que funciona; chave de 44 díg. é
  // tentada via `nfe` apenas como último recurso.
  const consultaItem = digits.length === 44 ? { nfe: digits } : { shipmentId: digits };

  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/embarcador/api/tracking/consultar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${c.token}`,
      },
      body: JSON.stringify({ consulta: [consultaItem] }),
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar a JadLog: ${(err as Error).message}` };
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* não-JSON */
  }
  if (!res.ok) {
    return { ok: false, error: json?.message || `Erro ${res.status} na JadLog`, status: res.status, detail: json ?? text };
  }

  const docs: any[] = Array.isArray(json?.consulta)
    ? json.consulta
    : Array.isArray(json?.documentos)
      ? json.documentos
      : json
        ? [json]
        : [];
  return { ok: true, data: { shipments: docs.map(normalizeJadlogShipment), raw: json } };
}

/**
 * DIAGNÓSTICO: testa as várias formas de consulta da Jadlog (shipmentId, codigo,
 * cte, NF+CNPJ e nfe/chave) e devolve o resultado de cada uma, para descobrirmos
 * qual identificador o envio aceita. Uma requisição por forma.
 */
export async function probeJadlog(opts: { nf?: string; chave?: string; codigo?: string }): Promise<{
  ok: boolean;
  tentativas: Array<{ forma: string; item: Record<string, unknown>; status?: number; encontrado: boolean; resposta: unknown }>;
  error?: string;
}> {
  const c = getJadlogConfig();
  if (!c.token) return { ok: false, tentativas: [], error: "JadLog não configurada (defina JADLOG_TOKEN)." };
  const nf = onlyDigits(opts.nf ?? "");
  const chave = onlyDigits(opts.chave ?? "");
  const codigo = onlyDigits(opts.codigo ?? "");

  const candidatos: Array<{ forma: string; item: Record<string, unknown> }> = [];
  // O "Código de rastreamento" do Tiny (ex.: 12396600024828) é o shipmentId.
  if (codigo) {
    candidatos.push(
      { forma: "shipmentId (cód. rastreio)", item: { shipmentId: codigo } },
      { forma: "cte (cód. rastreio)", item: { cte: codigo } },
      { forma: "codigo (cód. rastreio)", item: { codigo } },
    );
  }
  if (chave.length === 44) candidatos.push({ forma: "nfe (chave)", item: { nfe: chave } });
  if (nf) {
    candidatos.push(
      { forma: "shipmentId (nº NF)", item: { shipmentId: nf } },
      { forma: "codigo (nº NF)", item: { codigo: nf } },
      { forma: "cte (nº NF)", item: { cte: nf } },
      { forma: "NF + CNPJ", item: { cnpj: c.cnpj, nf } },
    );
  }

  const tentativas = [] as Array<{ forma: string; item: Record<string, unknown>; status?: number; encontrado: boolean; resposta: unknown }>;
  for (const cand of candidatos) {
    let resposta: unknown = null;
    let status: number | undefined;
    try {
      const res = await fetch(`${c.apiBaseUrl}/embarcador/api/tracking/consultar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${c.token}` },
        body: JSON.stringify({ consulta: [cand.item] }),
      });
      status = res.status;
      const t = await res.text();
      try {
        resposta = t ? JSON.parse(t) : null;
      } catch {
        resposta = t;
      }
    } catch (err) {
      resposta = `Falha de rede: ${(err as Error).message}`;
    }
    // "encontrado" = item de consulta SEM o campo de erro.
    const item0 = (resposta as any)?.consulta?.[0];
    const encontrado = Boolean(item0 && !item0.erro && !item0.error);
    tentativas.push({ forma: cand.forma, item: cand.item, status, encontrado, resposta });
  }

  return { ok: true, tentativas };
}

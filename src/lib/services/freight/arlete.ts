/**
 * Integração com o SSW (sistema usado pela Arlete Transportes — domínio "ARL").
 *
 * ⚠️ BEST-EFFORT: a documentação pública da WebAPI de cotação do SSW não está
 * aberta para leitura. Implementamos o contrato SOAP `cotar` (estável e mais
 * usado) e o rastreio por chave de NF-e (WebAPI JSON `trackingdanfe`). O parsing
 * é tolerante e guardamos a resposta crua — ao validar com a 1ª cotação real,
 * ajustamos nomes/ordem de parâmetros se necessário.
 *
 * Credenciais e dados do remetente ficam em variáveis de ambiente.
 */

import type {
  QuoteParams,
  QuoteOutcome,
  TrackingEvent,
  TrackingShipment,
  TrackingOutcome,
} from "@/lib/services/freight/types";
import { mercadoriaCodeForCep } from "@/lib/services/freight/data/arlete-mercadoria";

const SSW_API_BASE = process.env.SSW_API_BASE_URL || "https://ssw.inf.br";

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getArleteConfig() {
  return {
    dominio: process.env.SSW_DOMINIO || "ARL",
    login: process.env.SSW_LOGIN || "",
    senha: process.env.SSW_SENHA || "",
    // Quem paga o frete (remetente Exx, por padrão).
    cnpjPagador: onlyDigits(process.env.SSW_CNPJ_PAGADOR || "51579683000114"),
    cepOrigem: onlyDigits(process.env.SSW_CEP_ORIGEM || "88352501"),
    apiBaseUrl: SSW_API_BASE.replace(/\/$/, ""),
  };
}

export function isArleteConfigured(): boolean {
  const c = getArleteConfig();
  return Boolean(c.login && c.senha);
}

const xmlEscape = (v: string | number) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Desfaz o escape de XML (inclusive duplo, ex.: "&amp;lt;" → "<"). */
function xmlUnescape(v: string): string {
  let out = v;
  for (let k = 0; k < 3 && /&(amp|lt|gt|quot|#\d+);/.test(out); k++) {
    out = out
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, "&");
  }
  return out;
}

/** Extrai o conteúdo de uma tag do XML de resposta (tolerante a namespaces). */
function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"));
  return m ? m[1].trim() : undefined;
}


/**
 * Cotação via SOAP `cotar` do SSW. Calcula a cubagem em m³ a partir da cubagem
 * detalhada e resolve o código de mercadoria pelo CEP de destino (tabela ARLETE).
 */
export async function quoteArlete(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getArleteConfig();
  if (!c.login || !c.senha) {
    return { ok: false, error: "Arlete/SSW não configurada (defina SSW_LOGIN e SSW_SENHA)." };
  }

  const cepDestino = onlyDigits(params.cepDestino);
  const cnpjDestinatario = onlyDigits(params.cnpjDestinatario);
  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe ao menos uma dimensão de volume (cubagem)." };

  // Cubagem total em m³ (altura×largura×comprimento × quantidade de cada linha).
  const volumeM3 = params.cubagem.reduce(
    (sum, d) => sum + d.altura * d.largura * d.comprimento * (d.volumes || 1),
    0,
  );
  const mercadoria = mercadoriaCodeForCep(cepDestino);
  const cepOrigem = onlyDigits(params.cepOrigem) || c.cepOrigem;
  // Número no formato brasileiro (vírgula decimal), como o SSW espera.
  const br = (v: number, dec: number) => v.toFixed(dec).replace(".", ",");

  // Envelope SOAP do método `cotar` (urn:sswinfbr.sswCotacao). Estrutura idêntica
  // à de integrações que funcionam contra ESTE endpoint: conjunto mínimo, valores
  // NÃO tipados, terminando em cnpjDestinatario. Sem ciffob/cnpjRemetente nem os
  // campos S/N (coletar/entrega difícil/contribuinte) — o SSW aplica os padrões
  // da tela 110. Enviar campos a mais desalinha a leitura posicional do serviço.
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sswinfbr.sswCotacao">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:cotar soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <dominio>${xmlEscape(c.dominio)}</dominio>
      <login>${xmlEscape(c.login)}</login>
      <senha>${xmlEscape(c.senha)}</senha>
      <cnpjPagador>${xmlEscape(c.cnpjPagador)}</cnpjPagador>
      <cepOrigem>${xmlEscape(cepOrigem)}</cepOrigem>
      <cepDestino>${xmlEscape(cepDestino)}</cepDestino>
      <valorNF>${xmlEscape(br(params.vlrMercadoria, 2))}</valorNF>
      <quantidade>${xmlEscape(params.volumes)}</quantidade>
      <peso>${xmlEscape(br(params.peso, 3))}</peso>
      <volume>${xmlEscape(br(volumeM3, 4))}</volume>
      <mercadoria>${xmlEscape(String(mercadoria).padStart(3, "0"))}</mercadoria>
      <cnpjDestinatario>${xmlEscape(cnpjDestinatario)}</cnpjDestinatario>
    </urn:cotar>
  </soapenv:Body>
</soapenv:Envelope>`;

  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/ws/sswCotacao/index.php`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "urn:sswinfbr.sswCotacao#cotar" },
      body: envelope,
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar o SSW: ${(err as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Erro ${res.status} no SSW`, status: res.status, detail: text.slice(0, 500) };
  }

  // A resposta do SSW vem como XML; o resultado costuma estar dentro de <return>
  // (às vezes JSON escapado, às vezes mais XML). Como o formato exato varia,
  // buscamos o valor do frete/prazo de forma tolerante (em qualquer profundidade).
  const fault = tag(text, "faultstring");
  if (fault) return { ok: false, error: `SSW: ${fault}`, status: 502, detail: text.slice(0, 1000) };

  // O <return> vem com o XML interno ESCAPADO (&lt;cotacao&gt;...). Desescapa
  // antes de ler, senão nem as mensagens de erro do SSW são encontradas.
  const ret = xmlUnescape(tag(text, "return") ?? text);
  let valor: number | undefined;
  let prazo: number | undefined;
  let erro: string | undefined;
  let cotacaoId: string | undefined;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(ret);
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    // JSON: procura o frete por chaves conhecidas, em qualquer nível.
    valor =
      deepFind(parsed, /^(frete|valor_frete|vlrfrete|totalfrete|valorfrete)$/i, toNumberLoose) ??
      deepFind(parsed, /frete/i, toNumberLoose) ??
      deepFind(parsed, /^(valor|total)$/i, toNumberLoose);
    prazo = deepFind(parsed, /prazo/i, (v) => {
      const n = toNumberLoose(v);
      return n != null && n < 1000 ? n : undefined; // evita confundir com valores grandes
    });
    cotacaoId = deepFind(parsed, /^(cotacao|numero|id)$/i, (v) =>
      v == null || v === "" ? undefined : String(v),
    );
    erro = deepFind(parsed, /mensagem|message|erro|error/i, (v) =>
      typeof v === "string" && v.trim() && !/^0$/.test(v.trim()) ? v.trim() : undefined,
    );
  } else {
    // Não é JSON: lê do XML por tags conhecidas.
    valor = toNumberLoose(tag(ret, "frete") ?? tag(ret, "valorFrete") ?? tag(ret, "totalFrete") ?? tag(ret, "valor"));
    prazo = toNumberLoose(tag(ret, "prazo") ?? tag(ret, "prazoEntrega"));
    cotacaoId = tag(ret, "cotacao") ?? tag(ret, "numero");
    erro = tag(ret, "mensagem") ?? tag(ret, "erro");
  }

  if (valor == null && erro) {
    return { ok: false, error: `SSW: ${erro}`, status: 422, detail: text.slice(0, 1000) };
  }
  if (valor == null) {
    return {
      ok: false,
      error: "Não consegui ler o valor do frete na resposta do SSW (me mande o texto abaixo para eu ajustar).",
      detail: text.slice(0, 1500),
    };
  }

  return { ok: true, data: { id: cotacaoId, totalFrete: valor, prazo, raw: text } };
}

/** Converte número tolerando formato BR ("1.234,56") e JSON (1234.56 / "1234.56"). */
function toNumberLoose(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && s.match(/\d/) ? n : undefined;
}

/** Busca, em qualquer profundidade, o 1º valor cuja CHAVE casa `keyRe` e passa em `pick`. */
function deepFind<T>(node: unknown, keyRe: RegExp, pick: (v: unknown) => T | undefined): T | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = deepFind(item, keyRe, pick);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (keyRe.test(k)) {
        const t = pick(v);
        if (t !== undefined) return t;
      }
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const r = deepFind(v, keyRe, pick);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

const str = (v: unknown): string | undefined => (v == null || v === "" ? undefined : String(v));

/** Remove o sufixo do código SSW de uma ocorrência ("SAIDA DE UNIDADE (82)" → "SAIDA DE UNIDADE"). */
function cleanOcorrencia(s?: string): string | undefined {
  return s ? s.replace(/\s*\(\d+\)\s*$/, "").trim() || undefined : undefined;
}

/** Converte data BR "DD/MM/AA" (ou "DD/MM/AAAA") em ISO "AAAA-MM-DD". */
function parseSswDateBr(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  return `${y.length === 2 ? `20${y}` : y}-${mo}-${d}`;
}

// Ocorrência de entrega concluída no SSW (código 1 / "ENTREGA REALIZADA …").
const SSW_ENTREGUE = /entrega\s+realizada/i;

function normalizeSswShipment(c: any): TrackingShipment {
  // No `trackingdanfe` o documento traz `header` (remetente/destinatário/NF) e
  // `tracking` (lista de ocorrências). Em outros formatos os campos vêm soltos.
  const header = c?.header ?? c;
  const eventsRaw: any[] = Array.isArray(c?.tracking)
    ? c.tracking
    : Array.isArray(c?.ocorrencias)
      ? c.ocorrencias
      : Array.isArray(c?.eventos)
        ? c.eventos
        : Array.isArray(header?.tracking)
          ? header.tracking
          : [];

  const timeline: TrackingEvent[] = eventsRaw.map((e) => ({
    data: str(e?.data_hora_efetiva ?? e?.data_hora ?? e?.data ?? e?.dataHora),
    descricao: cleanOcorrencia(str(e?.ocorrencia ?? e?.descricao ?? e?.ds_ocorrencia ?? e?.status)),
    local: str(e?.cidade ?? e?.local ?? e?.unidade ?? e?.filial),
  }));

  const entrega = eventsRaw.find(
    (e) => SSW_ENTREGUE.test(String(e?.ocorrencia ?? "")) || String(e?.codigo_ssw ?? "") === "1",
  );
  const last = eventsRaw[eventsRaw.length - 1];
  // Previsão de entrega: o SSW só a informa no texto de algumas ocorrências
  // ("… Previsao de entrega: 12/06/26."). Pega a última que aparecer.
  const previsao = eventsRaw
    .map((e) => parseSswDateBr(String(e?.descricao ?? "").match(/previs[aã]o de entrega:\s*([\d/]+)/i)?.[1]))
    .filter(Boolean)
    .pop();

  return {
    status: entrega ? "entregue" : cleanOcorrencia(str(last?.ocorrencia ?? last?.status ?? c?.situacao)),
    entregue: Boolean(entrega),
    numero: str(header?.nro_nf ?? header?.numero_nf ?? c?.nro_nf ?? c?.numero_nf),
    origem: str(header?.remetente ?? c?.origem ?? c?.remetente),
    destino: str(header?.destinatario ?? c?.destino ?? c?.destinatario),
    previsaoEntrega: previsao ?? str(c?.previsao_entrega ?? c?.previsaoEntrega),
    dataEntrega: entrega ? str(entrega?.data_hora_efetiva ?? entrega?.data_hora) : str(c?.data_entrega ?? c?.dataEntrega),
    ultimaOcorrencia: cleanOcorrencia(str(last?.ocorrencia ?? last?.descricao ?? c?.ultima_ocorrencia)),
    timeline,
  };
}

/**
 * Rastreio do SSW pela chave da NF-e (WebAPI JSON `trackingdanfe`).
 * Aqui `notaFiscal` deve ser a CHAVE da NF-e (44 dígitos). Passe a chave em vez
 * do número da nota ao chamar.
 */
export async function trackArlete(notaFiscal: string): Promise<TrackingOutcome> {
  const c = getArleteConfig();
  const chave = onlyDigits(notaFiscal);
  if (chave.length !== 44) {
    return { ok: false, error: "O rastreio SSW é pela CHAVE da NF-e (44 dígitos). Esta NF não tem a chave salva." };
  }

  let res: Response;
  try {
    res = await fetch(`${c.apiBaseUrl}/api/trackingdanfe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ chave_nfe: chave }),
    });
  } catch (err) {
    return { ok: false, error: `Falha de rede ao chamar o SSW: ${(err as Error).message}` };
  }

  const textBody = await res.text();
  let json: any = null;
  try {
    json = textBody ? JSON.parse(textBody) : null;
  } catch {
    /* resposta não-JSON */
  }
  if (!res.ok) {
    return { ok: false, error: json?.message || `Erro ${res.status} no SSW`, status: res.status, detail: json ?? textBody };
  }

  // O trackingdanfe responde { success, message, documento: { header, tracking } }.
  // Toleramos também formatos com `documentos` (lista) ou campos no topo.
  if (json && json.success === false) {
    return { ok: false, error: json.message || "Documento não localizado no SSW.", status: 404, detail: json };
  }
  const docs: any[] = Array.isArray(json?.documentos)
    ? json.documentos
    : json?.documento
      ? [json.documento]
      : Array.isArray(json)
        ? json
        : json
          ? [json]
          : [];

  return { ok: true, data: { shipments: docs.map(normalizeSswShipment), raw: json } };
}

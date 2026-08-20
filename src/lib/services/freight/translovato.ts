/**
 * Integração com o Web Service de COTAÇÃO da Translovato (SOAP/XML legado).
 * Doc: "Web Service Cotação V1.6" (PDF do cliente).
 *
 * ⚠️ Este serviço é SEPARADO da API REST da BBM (que só faz rastreio). A cotação
 * da Translovato roda num Web Service SOAP próprio, em HTTP na porta 85:
 *   http://portalcotacao.translovato.com.br:85/WsCotacao.dll/soap/IWSSimulacaoFrete
 *
 * Fluxo (2 passos):
 *   1) geraChaveAcessoJSON { CNPJ, Usuario, Senha(base64) } → chave (vale 5 min)
 *   2) SimulacaoFrete { CNPJ, Usuario, ChaveAcesso, CdEmpresa, CdRemetente,
 *      CdDestinatario, NrCepColeta, NrCepCalcAte, ... } → <Frete> (valor total)
 *
 * Credenciais/parametros via env (nunca no código — repo público):
 *   TRANSLOVATO_CNPJ        — CNPJ do portal do cliente (portal.translovato.com.br)
 *   TRANSLOVATO_USUARIO     — usuário do portal
 *   TRANSLOVATO_SENHA       — senha do portal (texto puro; convertemos p/ base64)
 *   TRANSLOVATO_CD_EMPRESA  — "código da empresa que atende" (fornecido no login)
 *   TRANSLOVATO_CD_NATUREZA — código da natureza da carga negociada
 *   TRANSLOVATO_CEP_ORIGEM  — CEP de coleta (default abaixo)
 *   TRANSLOVATO_CNPJ_REMETENTE — CNPJ remetente (default NRX)
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";
import { pareceNaoAtende, msgNaoAtende } from "./regiao";

const WS_URL =
  process.env.TRANSLOVATO_WS_URL ||
  "http://portalcotacao.translovato.com.br:85/WsCotacao.dll/soap/IWSSimulacaoFrete";

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

// Escapa os 5 caracteres que quebram XML.
function xmlEscape(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function getTranslovatoConfig() {
  return {
    cnpj: onlyDigits(process.env.TRANSLOVATO_CNPJ || ""),
    usuario: process.env.TRANSLOVATO_USUARIO || "",
    senha: process.env.TRANSLOVATO_SENHA || "",
    // CdEmpresa 6 = filial da Translovato que atende a conta (informado pela
    // transportadora). CdNatureza 0 usa o padrão do cadastro; sobrepor via env
    // se eles exigirem um código específico.
    cdEmpresa: Number(process.env.TRANSLOVATO_CD_EMPRESA || 6),
    cdNatureza: Number(process.env.TRANSLOVATO_CD_NATUREZA || 0),
    cepOrigem: onlyDigits(process.env.TRANSLOVATO_CEP_ORIGEM || "88352501"),
    cnpjRemetente: onlyDigits(process.env.TRANSLOVATO_CNPJ_REMETENTE || "51579683000114"),
    wsUrl: WS_URL,
  };
}

export function isTranslovatoConfigured(): boolean {
  const c = getTranslovatoConfig();
  return Boolean(c.cnpj && c.usuario && c.senha && c.cdEmpresa);
}

// Extrai o valor de uma tag XML (primeira ocorrência com CONTEÚDO numérico/texto,
// ignorando as tags-referência do tipo <Tag href="#2"/>).
function xmlValor(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

// SOAPAction exato por operação (WSDL: style="rpc"). Sem isso o serviço Delphi
// costuma recusar a chamada.
const SOAP_NS = "urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete";
const soapAction = (op: string) => `${SOAP_NS}#${op}`;

async function postSoap(
  body: string,
  action: string,
  cookie?: string,
): Promise<{ ok: true; xml: string; cookie: string | null } | { ok: false; error: string; status?: number }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "text/xml; charset=utf-8", SOAPAction: action };
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(WS_URL, { method: "POST", headers, body });
    const xml = await res.text();
    // Serviços Delphi costumam amarrar a sessão num cookie — repassamos adiante.
    const setCookie = res.headers.get("set-cookie");
    const cookiePar = setCookie ? setCookie.split(";")[0] : null;
    if (!res.ok) return { ok: false, error: `Translovato ${res.status}: ${xml.slice(0, 200)}`, status: res.status };
    return { ok: true, xml, cookie: cookiePar };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Translovato)" };
  }
}

/** Passo 1: solicita a chave de acesso (válida por 5 min). Exportado para
 *  diagnóstico — permite validar CNPJ/usuário/senha sem precisar do CdEmpresa. */
export async function geraChaveAcesso(): Promise<{ ok: true; chave: string; cookie: string | null } | { ok: false; error: string }> {
  const c = getTranslovatoConfig();
  const senhaB64 = Buffer.from(c.senha, "utf-8").toString("base64");
  const envelope =
    `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<urn:geraChaveAcessoJSON soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<CNPJ xsi:type="xsd:string">${xmlEscape(c.cnpj)}</CNPJ>` +
    `<Usuario xsi:type="xsd:string">${xmlEscape(c.usuario)}</Usuario>` +
    `<Senha xsi:type="xsd:string">${xmlEscape(senhaB64)}</Senha>` +
    `</urn:geraChaveAcessoJSON></soapenv:Body></soapenv:Envelope>`;

  const r = await postSoap(envelope, soapAction("geraChaveAcessoJSON"));
  if (!r.ok) return { ok: false, error: r.error };

  // O <return> vem como uma STRING que contém um JSON:
  //   {"dadosAcesso":{"chave":"<CHAVE>","dataAcesso":"..."}}
  // Extraímos o <return> e depois o campo "chave" de dentro do JSON.
  const ret = xmlValor(r.xml, "return");
  let chave: string | null = null;
  if (ret) {
    // Desescapa entidades XML que possam ter sobrado (&quot; etc.).
    const jsonStr = ret
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    try {
      const obj = JSON.parse(jsonStr);
      chave = obj?.dadosAcesso?.chave ?? obj?.chave ?? null;
    } catch {
      // Fallback: pega o valor de "chave":"..." por regex.
      chave = (jsonStr.match(/"chave"\s*:\s*"([^"]+)"/i) ?? [])[1] ?? null;
    }
  }
  if (!chave) chave = (r.xml.match(/"chave"\s*:\s*"([^"]+)"/i) ?? [])[1] ?? null;
  if (!chave) return { ok: false, error: `Não foi possível ler a chave de acesso. Retorno: ${r.xml.slice(0, 250)}` };
  return { ok: true, chave, cookie: r.cookie };
}

export async function quoteTranslovato(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getTranslovatoConfig();
  if (!isTranslovatoConfigured()) {
    return { ok: false, error: "Translovato não configurada (defina TRANSLOVATO_CNPJ, _USUARIO, _SENHA e _CD_EMPRESA)." };
  }

  const cepDestino = onlyDigits(params.cepDestino);
  if (!cepDestino) return { ok: false, error: "CEP de destino ausente." };
  const cepOrigem = onlyDigits(params.cepOrigem) || c.cepOrigem;
  const cnpjRemetente = onlyDigits(params.cnpjRemetente) || c.cnpjRemetente;
  const cnpjDestinatario = onlyDigits(params.cnpjDestinatario);

  // Peso cubado: fator 300 kg/m³ (rodoviário fracionado); envia peso e m³ reais.
  const volumeM3 = (params.cubagem ?? []).reduce(
    (s, d) => s + d.altura * d.largura * d.comprimento * (d.volumes || 1),
    0,
  );
  const peso = Math.max(params.peso || 0, 0);

  // Passo 1: chave (com o cookie de sessão que o servidor devolver).
  let chaveR = await geraChaveAcesso();
  if (!chaveR.ok) return { ok: false, error: chaveR.error };

  // Passo 2: cotação.
  const montaEnvelope = (chave: string) =>
    `<soapenv:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:uWSSimulacaoFreteIntf-IWSSimulacaoFrete">` +
    `<soapenv:Header/><soapenv:Body>` +
    `<urn:SimulacaoFrete soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
    `<CNPJ xsi:type="xsd:string">${xmlEscape(c.cnpj)}</CNPJ>` +
    `<Usuario xsi:type="xsd:string">${xmlEscape(c.usuario)}</Usuario>` +
    `<ChaveAcesso xsi:type="xsd:string">${xmlEscape(chave)}</ChaveAcesso>` +
    `<CdEmpresa xsi:type="xsd:int">${c.cdEmpresa}</CdEmpresa>` +
    `<CdRemetente xsi:type="xsd:string">${xmlEscape(cnpjRemetente)}</CdRemetente>` +
    `<CdDestinatario xsi:type="xsd:string">${xmlEscape(cnpjDestinatario)}</CdDestinatario>` +
    `<NrCepColeta xsi:type="xsd:int">${Number(cepOrigem) || 0}</NrCepColeta>` +
    `<NrCepCalcAte xsi:type="xsd:int">${Number(cepDestino) || 0}</NrCepCalcAte>` +
    `<InTipoFrete xsi:type="xsd:int">1</InTipoFrete>` +
    `<InICMS xsi:type="xsd:int">0</InICMS>` +
    `<CdNatureza xsi:type="xsd:int">${c.cdNatureza}</CdNatureza>` +
    `<CdTransporte xsi:type="xsd:int">1</CdTransporte>` +
    `<CdTipoVeiculo xsi:type="xsd:int">0</CdTipoVeiculo>` +
    `<VlMercadoria xsi:type="xsd:double">${params.vlrMercadoria || 0}</VlMercadoria>` +
    `<QtPeso xsi:type="xsd:double">${Number(peso.toFixed(3))}</QtPeso>` +
    `<QtVolumes xsi:type="xsd:double">${params.volumes || 1}</QtVolumes>` +
    `<QtMetrosCubicos xsi:type="xsd:double">${Number(volumeM3.toFixed(6))}</QtMetrosCubicos>` +
    `<QtPares xsi:type="xsd:double">0</QtPares>` +
    `</urn:SimulacaoFrete></soapenv:Body></soapenv:Envelope>`;

  let r = await postSoap(montaEnvelope(chaveR.chave), soapAction("SimulacaoFrete"), chaveR.cookie ?? undefined);
  if (!r.ok) return { ok: false, error: r.error, status: r.status };
  // "Chave de Acesso Inválida": regenera a chave e tenta UMA vez mais, na
  // mesma sessão (cookie novo).
  if (/chave de acesso inv/i.test(r.xml)) {
    chaveR = await geraChaveAcesso();
    if (chaveR.ok) {
      const r2 = await postSoap(montaEnvelope(chaveR.chave), soapAction("SimulacaoFrete"), chaveR.cookie ?? undefined);
      if (r2.ok) r = r2;
    }
  }

  // Erro de negócio: pelo WSDL, TErro = { Codigo, Descricao, Complemento }.
  const erroDesc = xmlValor(r.xml, "Descricao");
  const erroComp = xmlValor(r.xml, "Complemento");
  const erroMsg = erroDesc
    ? pareceNaoAtende(erroDesc)
      ? msgNaoAtende("Translovato")
      : `Translovato: ${erroDesc}${erroComp ? ` — ${erroComp}` : ""}`
    : null;
  // O valor total do frete é a tag <Frete xsi:type="xsd:double">254.52</Frete>
  // (existe também <Frete href="#2"/>, que xmlValor ignora por não ter conteúdo).
  const freteStr = xmlValor(r.xml, "Frete") || xmlValor(r.xml, "ValorLiquido");
  const total = freteStr ? Number(freteStr) : null;
  if (total == null || !Number.isFinite(total) || total <= 0) {
    // Sem descrição de erro: mostra o MIOLO do envelope (pula o cabeçalho XML,
    // que só ocupava espaço e escondia o conteúdo útil).
    const idxBody = r.xml.search(/<SOAP-ENV:Body|<soap:Body|<soapenv:Body/i);
    const miolo = idxBody >= 0 ? r.xml.slice(idxBody, idxBody + 400) : r.xml.slice(0, 400);
    return { ok: false, error: erroMsg || `Sem valor de frete no retorno. ${miolo}` };
  }

  return {
    ok: true,
    data: {
      totalFrete: total,
      prazo: undefined, // o WS de cotação não retorna prazo de entrega
      raw: r.xml,
    },
  };
}

/** A cotação e o rastreio da Translovato são serviços distintos; o rastreio
 *  fica na API REST da BBM (ver bbm.ts). Aqui só cotação. */
export async function trackTranslovato(_nf: string): Promise<TrackingOutcome> {
  return { ok: false, error: "Rastreio da Translovato é feito pela API da BBM (rastreio), não pelo WS de cotação." };
}

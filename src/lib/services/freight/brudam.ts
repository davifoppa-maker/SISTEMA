/**
 * Integração com a API Multi da Brudam.
 * Doc: https://multi.brudam.com.br/docs/
 *
 * ⚠️ BEST-EFFORT: o portal de docs exige login; implementamos o fluxo padrão da
 * Multi (autenticação por usuário/senha → token Bearer; cotação e rastreio em
 * JSON). O parsing é tolerante e guardamos a resposta crua — ao validar com a 1ª
 * cotação real, ajustamos nomes de campos se necessário.
 *
 * Credenciais via variáveis de ambiente:
 *   BRUDAM_USUARIO  — usuário da conta Multi
 *   BRUDAM_SENHA    — senha da conta Multi
 *   BRUDAM_TOKEN    — (opcional) token fixo; se ausente, autentica por usuário/senha
 *   BRUDAM_CEP_ORIGEM / BRUDAM_CNPJ_REMETENTE (opcionais; default p/ NRX)
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "./types";

const API_BASE = (process.env.BRUDAM_API_BASE_URL || "https://multi.brudam.com.br/api/v1").replace(/\/$/, "");

function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

export function getBrudamConfig() {
  return {
    usuario: process.env.BRUDAM_USUARIO || "",
    senha: process.env.BRUDAM_SENHA || "",
    token: process.env.BRUDAM_TOKEN || "",
    cepOrigem: onlyDigits(process.env.BRUDAM_CEP_ORIGEM || process.env.BRASPRESS_CEP_ORIGEM || "88352501"),
    cnpjRemetente: onlyDigits(process.env.BRUDAM_CNPJ_REMETENTE || process.env.BRASPRESS_CNPJ_REMETENTE || "51579683000114"),
    // CNPJ do EMITENTE: base da Multitrans que atende a conta — informado pela
    // própria transportadora: 18.963.112/0001-03.
    cnpjEmitente: onlyDigits(process.env.BRUDAM_CNPJ_EMITENTE || "18963112000103"),
    // Código de serviço informado pela Multitrans: cServ=012. O cTab NÃO é
    // enviado por padrão — validado em produção que sem ele a API seleciona a
    // tabela do cliente sozinha (retornou 114); o "019" informado não bate com
    // esse campo. BRUDAM_CTAB força um valor se um dia precisar.
    cServ: process.env.BRUDAM_CSERV || "012",
    cTab: process.env.BRUDAM_CTAB || "",
    apiBaseUrl: API_BASE,
  };
}

// CEP → código IBGE da cidade (a cotação da Multi usa IBGE, não CEP).
// ViaCEP é público e estável; cache em memória por CEP.
const ibgeCache = new Map<string, string>();
async function cepParaIbge(cep: string): Promise<{ ok: true; ibge: string } | { ok: false; error: string }> {
  const c8 = onlyDigits(cep).padStart(8, "0");
  const hit = ibgeCache.get(c8);
  if (hit) return { ok: true, ibge: hit };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c8}/json/`, { headers: { Accept: "application/json" } });
    const j = await r.json().catch(() => null) as { ibge?: string; erro?: boolean } | null;
    if (!r.ok || !j || j.erro || !j.ibge) return { ok: false, error: `CEP ${c8} não encontrado (ViaCEP).` };
    ibgeCache.set(c8, j.ibge);
    return { ok: true, ibge: j.ibge };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao consultar ViaCEP." };
  }
}

export function isBrudamConfigured(): boolean {
  const c = getBrudamConfig();
  return Boolean(c.token || (c.usuario && c.senha));
}

// Cache do token JWT em memória (renovamos ao expirar/uso).
let brudamTokenCache: { token: string; exp: number } | null = null;

/**
 * Login da Multi (Brudam): POST /acesso/auth/login { usuario, senha } → token.
 * Doc: https://multi.brudam.com.br/docs/#/Login/post_acesso_auth_login
 * Se BRUDAM_TOKEN estiver definido, usa direto (sem login).
 */
export async function getBrudamToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const c = getBrudamConfig();
  if (c.token) return { ok: true, token: c.token };
  if (!c.usuario || !c.senha) return { ok: false, error: "Brudam não configurada (defina BRUDAM_USUARIO e BRUDAM_SENHA)." };
  if (brudamTokenCache && brudamTokenCache.exp > Date.now()) return { ok: true, token: brudamTokenCache.token };

  try {
    const res = await fetch(`${c.apiBaseUrl}/acesso/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ usuario: c.usuario, senha: c.senha }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = (json as any)?.message ?? (json as any)?.error ?? JSON.stringify(json).slice(0, 200);
      return { ok: false, error: `Brudam login ${res.status}: ${msg}` };
    }
    const d = (json as any)?.data ?? json;
    const token = d?.token ?? d?.access_token ?? d?.accessToken ?? (json as any)?.token;
    if (!token) return { ok: false, error: `Login sem token. Retorno: ${JSON.stringify(json).slice(0, 200)}` };
    // Token da Multi costuma durar ~1h; cacheia por 50 min por segurança.
    brudamTokenCache = { token: String(token), exp: Date.now() + 50 * 60 * 1000 };
    return { ok: true, token: brudamTokenCache.token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Brudam login)" };
  }
}

export async function quoteBrudam(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getBrudamConfig();
  if (!isBrudamConfigured()) {
    return { ok: false, error: "Brudam não configurada (defina BRUDAM_USUARIO/BRUDAM_SENHA)." };
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

  const auth = await getBrudamToken();
  if (!auth.ok) return { ok: false, error: auth.error };

  // A cotação da Multi usa código IBGE das cidades (não CEP) — converte via ViaCEP.
  const [ibgeOrig, ibgeDest] = await Promise.all([cepParaIbge(cepOrigem), cepParaIbge(cepDestino)]);
  if (!ibgeOrig.ok) return { ok: false, error: `Origem: ${ibgeOrig.error}` };
  if (!ibgeDest.ok) return { ok: false, error: `Destino: ${ibgeDest.error}` };

  // Corpo OFICIAL (schema CalculoFrete do swagger da Multi):
  //   nDocEmit/nDocCli (CNPJs), cOrigCalc/cDestCalc (IBGE), pBru, qVol, vNF.
  const pesoCubado = volumeM3 * 300;
  const body: Record<string, unknown> = {
    nDocEmit: c.cnpjEmitente,
    nDocCli: cnpjRemetente,
    nDocRem: cnpjRemetente,
    cOrigCalc: Number(ibgeOrig.ibge),
    cDestCalc: Number(ibgeDest.ibge),
    CEP: cepDestino,
    pBru: Number((params.peso || peso).toFixed(3)),
    pCub: Number(pesoCubado.toFixed(3)),
    qVol: params.volumes || 1,
    vNF: params.vlrMercadoria || 0,
  };
  // Só envia o documento do destinatário se for CPF/CNPJ válido em tamanho —
  // valor malformado derruba a requisição inteira ("Erro nos dados enviados").
  if (cnpjDestinatario.length === 11 || cnpjDestinatario.length === 14) body.nDocDest = cnpjDestinatario;
  if (c.cServ) body.cServ = c.cServ;
  if (c.cTab) body.cTab = c.cTab;

  try {
    const path = process.env.BRUDAM_COTACAO_PATH || "/frete/cotacao/calcula";
    const dispara = (corpo: Record<string, unknown>) =>
      fetch(`${c.apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(corpo),
      });
    let res = await dispara(body);
    // Validado em produção: SEM cTab a API escolhe a tabela do cliente sozinha
    // (retornou 114). Se o cTab informado falhar, tenta de novo sem ele.
    if (!res.ok && body.cTab) {
      const semTab = { ...body };
      delete (semTab as Record<string, unknown>).cTab;
      const retry = await dispara(semTab);
      if (retry.ok) res = retry;
    }
    const texto = await res.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { /* mantém texto cru para o erro */ }
    if (!res.ok) {
      const msgApi = json?.data?.message ?? json?.message ?? texto.slice(0, 300);
      // Situação conhecida: a conta ainda não tem serviço/tabela vinculado no
      // sistema da Multitrans — pendência do lado da transportadora.
      if (/c\u00f3digo de servi\u00e7o|código de serviço|nenhum servi\u00e7o|nenhum serviço/i.test(String(msgApi))) {
        return {
          ok: false,
          error: "Multitrans: aguardando a transportadora vincular o serviço/tabela de frete da conta (código de serviço). Já solicitado ao comercial.",
          status: res.status,
          detail: json,
        };
      }
      return {
        ok: false,
        error: `Brudam ${res.status}: ${msgApi}`,
        status: res.status,
        detail: json ?? { corpoEnviado: body, respostaCrua: texto.slice(0, 500) },
      };
    }
    // Resposta oficial: { status, message, data: [ { cTab, cServ, vColeta, vEntrega,
    // vNF, vPeso, vPedagio, vTAD, vAdv, vGris, ... } ] } — soma/total e prazo podem
    // variar de nome; parse tolerante com fallback: soma dos componentes v*.
    const item = Array.isArray(json?.data) ? json.data[0] : (json?.data ?? json);
    if (!item || typeof item !== "object") {
      return { ok: false, error: `Resposta sem dados de frete: ${texto.slice(0, 300)}` };
    }
    let total: number | null = null;
    for (const k of ["vTotal", "vFrete", "total", "valorTotal", "valor_frete", "vTotalFrete"]) {
      const v = (item as any)[k];
      if (typeof v === "number" && v > 0) { total = v; break; }
    }
    if (total == null) {
      // Soma dos componentes v* numéricos (vColeta, vEntrega, vPeso, vNF, vGris...).
      let soma = 0;
      for (const [k, v] of Object.entries(item)) {
        if (/^v[A-Z]/.test(k) && typeof v === "number" && Number.isFinite(v)) soma += v;
      }
      if (soma > 0) total = Number(soma.toFixed(2));
    }
    let prazo: number | null = null;
    for (const k of ["nDias", "prazo", "qPrazo", "dPrazo", "prazoEntrega", "prazo_entrega", "diasUteis"]) {
      const v = (item as any)[k];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) { prazo = n; break; }
    }
    if (total == null || total <= 0) {
      return { ok: false, error: `Sem valor de frete no retorno. ${JSON.stringify(item).slice(0, 300)}` };
    }
    return {
      ok: true,
      data: {
        id: (item as any).cTab ?? (item as any).id,
        totalFrete: total,
        prazo: prazo ?? undefined,
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Brudam)" };
  }
}

export async function trackBrudam(notaFiscal: string): Promise<TrackingOutcome> {
  // API oficial de RASTREAMENTO da Brudam (coleção Postman da Multitrans):
  //   GET {tracking}/tracking/remetente/{cnpjCliente}/{documentos}?token=TOKEN
  //   GET {tracking}/tracking/documentos/{documentos}?token=TOKEN   (fallback)
  // O token é o ESTÁTICO fornecido pela transportadora (BRUDAM_TOKEN) — não o
  // JWT do login. Consulta por CNPJ é limitada a 30 dias da emissão da minuta.
  const c = getBrudamConfig();
  const base = (process.env.BRUDAM_TRACKING_URL || "http://rodo.ws.brudam.com.br").replace(/\/$/, "");
  if (!c.token) {
    return { ok: false, error: "Rastreio Multi não configurado (defina BRUDAM_TOKEN — token de rastreamento fornecido pela transportadora)." };
  }
  const nf = encodeURIComponent(notaFiscal.trim());
  const urls = [
    `${base}/tracking/remetente/${c.cnpjRemetente}/${nf}?token=${encodeURIComponent(c.token)}`,
    `${base}/tracking/documentos/${nf}?token=${encodeURIComponent(c.token)}`,
  ];
  let ultimoErro = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const texto = await res.text();
      let json: any = null;
      try { json = JSON.parse(texto); } catch { /* cru */ }
      if (!res.ok) { ultimoErro = `Multi rastreio ${res.status}: ${texto.slice(0, 200)}`; continue; }
      // Formato de resposta não documentado na coleção — parse tolerante.
      const lista: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : json ? [json] : [];
      if (lista.length === 0) { ultimoErro = "Sem dados de rastreio para este documento."; continue; }
      const d = lista[0];
      const ocorrencias: Array<{ data?: string; descricao?: string; local?: string }> =
        d.ocorrencias ?? d.eventos ?? d.tracking ?? d.historico ?? [];
      return {
        ok: true,
        data: {
          shipments: [
            {
              status: d.status ?? d.situacao ?? d.ultimaOcorrencia?.descricao,
              numero: d.numero ?? d.nf ?? notaFiscal,
              origem: d.origem,
              destino: d.destino,
              previsaoEntrega: d.previsaoEntrega ?? d.previsao_entrega ?? d.prazo,
              dataEntrega: d.dataEntrega ?? d.data_entrega,
              ultimaOcorrencia: ocorrencias[0]?.descricao ?? d.ultimaOcorrencia?.descricao,
              entregue: /entreg/i.test(String(d.status ?? d.situacao ?? "")),
              timeline: (Array.isArray(ocorrencias) ? ocorrencias : []).map((o: any) => ({
                data: o.data ?? o.data_hora ?? o.dataOcorrencia,
                descricao: o.descricao ?? o.ocorrencia,
                local: o.local ?? o.cidade,
              })),
            },
          ],
          raw: json ?? texto.slice(0, 500),
        },
      };
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : "Erro de rede (Multi rastreio)";
    }
  }
  return { ok: false, error: ultimoErro || "Rastreio Multi indisponível." };
}


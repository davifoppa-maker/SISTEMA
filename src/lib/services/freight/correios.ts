/**
 * Integração Correios — API CWS v3.
 * Doc: https://api.correios.com.br
 *
 * Auth em 2 etapas (token ~1h, cacheado em memória):
 *   POST /token/v1/autentica/cartaopostagem  (Basic user:accessCode + {numero: cartão})
 * Preço:  GET /preco/v1/nacional/{codigoServico}?query   (query string, não JSON)
 * Prazo:  GET /prazo/v1/nacional/{codigoServico}?cepOrigem=&cepDestino=
 * Rastreio (SRO): GET /srorastro/v1/objetos/{codigo}?resultado=T  (Accept-Language: pt-BR!)
 *
 * Pegadinhas do guia aplicadas: peso em GRAMAS (mín 300), dimensões em cm
 * (mín 16/11/2), vlDeclarado mín 25,63, cartão de postagem libera preço de
 * contrato, preço em formato BR ("1.234,56"), SRO exige Accept-Language.
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome, TrackingShipment } from "@/lib/services/freight/types";
import { freightFetch, parseJsonSafe, parseBrNumber, onlyDigits } from "@/lib/services/freight/http";

const BASE = (process.env.CORREIOS_API_BASE_URL || "https://api.correios.com.br").replace(/\/$/, "");

export function getCorreiosConfig() {
  return {
    user: process.env.CORREIOS_USER || "",
    accessCode: process.env.CORREIOS_ACCESS_CODE || "",
    cartao: process.env.CORREIOS_CARTAO_POSTAGEM || "",
    servicoPac: process.env.CORREIOS_SERVICO_PAC || "03298",
    servicoSedex: process.env.CORREIOS_SERVICO_SEDEX || "03220",
    vdPac: process.env.CORREIOS_VD_PAC || "064",
    vdSedex: process.env.CORREIOS_VD_SEDEX || "019",
    cepOrigem: onlyDigits(process.env.CORREIOS_CEP_ORIGEM || "88352501"),
    base: BASE,
  };
}

export function isCorreiosConfigured(): boolean {
  const c = getCorreiosConfig();
  return Boolean(c.user && c.accessCode && c.cartao);
}

// Cache do token em memória (expira ~1h; renova com margem de 60s).
let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const c = getCorreiosConfig();
  if (tokenCache && tokenCache.exp - 60_000 > Date.now()) return tokenCache.token;
  const basic = Buffer.from(`${c.user}:${c.accessCode}`).toString("base64");
  const { res, text } = await freightFetch(`${c.base}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ numero: c.cartao }),
  });
  const j = parseJsonSafe<{ token?: string; expiraEm?: string }>(text);
  if (!res.ok || !j?.token) {
    throw new Error(`Correios token ${res.status}: ${(j as any)?.mensagem || text.slice(0, 200)}`);
  }
  const exp = j.expiraEm ? Date.parse(j.expiraEm) : Date.now() + 3_600_000;
  tokenCache = { token: j.token, exp: isNaN(exp) ? Date.now() + 3_600_000 : exp };
  return j.token;
}

/** Cota um serviço (PAC ou SEDEX). Retorna {frete, prazo} ou null se indisponível. */
async function cotarServico(
  token: string,
  servico: string,
  vd: string,
  q: { cepOrigem: string; cepDestino: string; gramas: number; comp: number; larg: number; alt: number; vlDeclarado: number },
): Promise<{ frete: number; prazo?: number } | { erro: string } | null> {
  const c = getCorreiosConfig();
  const params = new URLSearchParams({
    cepOrigem: q.cepOrigem,
    cepDestino: q.cepDestino,
    psObjeto: String(Math.max(300, Math.round(q.gramas))),
    tpObjeto: "2",
    comprimento: String(Math.max(16, Math.round(q.comp))),
    largura: String(Math.max(11, Math.round(q.larg))),
    altura: String(Math.max(2, Math.round(q.alt))),
    vlDeclarado: q.vlDeclarado.toFixed(2),
    servicosAdicionais: vd,
  });
  const { res, text } = await freightFetch(`${c.base}/preco/v1/nacional/${servico}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const j = parseJsonSafe<any>(text);
  if (!res.ok) return { erro: j?.mensagem || `Erro ${res.status}` };
  const precoStr = j?.pcFinal ?? j?.pcFinalLiquido ?? j?.pcTotal ?? j?.preco ?? j?.pcProduto;
  const frete = parseBrNumber(precoStr);
  if (frete == null) return { erro: j?.txErro || j?.mensagem || "sem preço" };

  // Prazo (opcional — falha aqui não derruba a cotação).
  let prazo: number | undefined;
  try {
    const pz = new URLSearchParams({ cepOrigem: q.cepOrigem, cepDestino: q.cepDestino });
    const r2 = await freightFetch(`${c.base}/prazo/v1/nacional/${servico}?${pz}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const j2 = parseJsonSafe<any>(r2.text);
    const p = j2?.prazoEntrega ?? j2?.prazo;
    if (p != null) prazo = Number(p);
  } catch { /* prazo é opcional */ }

  return { frete, prazo };
}

export async function quoteCorreios(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getCorreiosConfig();
  if (!isCorreiosConfigured()) {
    return { ok: false, error: "Correios não configurado (CORREIOS_USER, CORREIOS_ACCESS_CODE, CORREIOS_CARTAO_POSTAGEM)." };
  }
  const cepDestino = onlyDigits(params.cepDestino);
  if (cepDestino.length !== 8) return { ok: false, error: "CEP de destino inválido." };
  if (!params.cubagem?.length) return { ok: false, error: "Informe a cubagem." };

  // Dimensões: usa a MAIOR caixa (em cm) e o peso total em gramas.
  const cmMax = params.cubagem.reduce(
    (m, d) => ({
      comp: Math.max(m.comp, d.comprimento * 100),
      larg: Math.max(m.larg, d.largura * 100),
      alt: Math.max(m.alt, d.altura * 100),
    }),
    { comp: 0, larg: 0, alt: 0 },
  );
  const q = {
    cepOrigem: onlyDigits(params.cepOrigem) || c.cepOrigem,
    cepDestino,
    gramas: (params.peso || 0.3) * 1000,
    comp: cmMax.comp,
    larg: cmMax.larg,
    alt: cmMax.alt,
    vlDeclarado: Math.max(params.vlrMercadoria || 0, 25.63),
  };

  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    const [pac, sedex] = await Promise.all([
      cotarServico(token, c.servicoPac, c.vdPac, q).catch(() => null),
      cotarServico(token, c.servicoSedex, c.vdSedex, q).catch(() => null),
    ]);
    const opcoes = [
      { nome: "PAC", r: pac },
      { nome: "SEDEX", r: sedex },
    ].filter((o) => o.r && "frete" in o.r) as { nome: string; r: { frete: number; prazo?: number } }[];

    if (opcoes.length === 0) {
      const err = (pac && "erro" in pac && pac.erro) || (sedex && "erro" in sedex && sedex.erro) || "sem preço";
      return { ok: false, error: `Correios: ${err}`, detail: { pac, sedex } };
    }
    // Retorna a opção mais barata.
    opcoes.sort((a, b) => a.r.frete - b.r.frete);
    const melhor = opcoes[0];
    return {
      ok: true,
      data: { totalFrete: melhor.r.frete, prazo: melhor.r.prazo, raw: { servico: melhor.nome, opcoes } },
    };
  } catch (err) {
    return { ok: false, error: `Falha ao cotar Correios: ${(err as Error).message}` };
  }
}

// ————— Rastreio (SRO) —————
const ENTREGUE_TIPOS = new Set(["BDE", "BDI", "BDR"]);
const ENTREGUE_CODS = new Set(["01", "1"]);

export async function trackCorreios(codigo: string): Promise<TrackingOutcome> {
  const c = getCorreiosConfig();
  if (!isCorreiosConfigured()) return { ok: false, error: "Correios não configurado." };
  const cod = String(codigo || "").trim().toUpperCase();
  if (!cod) return { ok: false, error: "Código SRO ausente." };

  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const { res, text } = await freightFetch(`${c.base}/srorastro/v1/objetos/${cod}?resultado=T`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "pt-BR" },
  });
  const j = parseJsonSafe<any>(text);
  if (!res.ok) return { ok: false, error: j?.mensagem || `Erro ${res.status} no rastreio Correios`, status: res.status, detail: j ?? text };

  const objetos: any[] = Array.isArray(j?.objetos) ? j.objetos : [];
  const shipments: TrackingShipment[] = objetos.map((o) => {
    const eventos: any[] = Array.isArray(o?.eventos) ? o.eventos : []; // mais recente primeiro
    const entregue = eventos.some(
      (e) => ENTREGUE_TIPOS.has(String(e?.tipo)) && ENTREGUE_CODS.has(String(e?.codigo)),
    ) || eventos.some((e) => /objeto entregue|entregue ao/i.test(String(e?.descricao ?? "")));
    return {
      status: String(eventos[0]?.descricao ?? o?.mensagem ?? "—"),
      numero: String(o?.codObjeto ?? cod),
      previsaoEntrega: o?.dtPrevista ? String(o.dtPrevista) : undefined,
      entregue,
      ultimaOcorrencia: eventos[0]?.descricao ? String(eventos[0].descricao) : undefined,
      timeline: eventos.map((e) => ({
        data: e?.dtHrCriado ? String(e.dtHrCriado) : undefined,
        descricao: String(e?.descricao ?? ""),
        local: e?.unidade?.endereco ? `${e.unidade.endereco.cidade ?? ""}/${e.unidade.endereco.uf ?? ""}` : undefined,
      })),
    };
  });

  return { ok: true, data: { shipments, raw: j } };
}

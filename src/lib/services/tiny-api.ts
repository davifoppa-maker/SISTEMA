// Cliente da API do Olist Tiny (API V3, OAuth2 / OpenID Connect).
//
// O Tiny V3 usa um servidor de autorização Keycloak. O fluxo é:
//   1. Redirecionar o usuário para AUTH_URL (response_type=code).
//   2. No callback, trocar o "code" por access_token + refresh_token (TOKEN_URL,
//      autenticando o app via HTTP Basic com client_id:client_secret).
//   3. Chamar a API V3 com Authorization: Bearer <access_token>.
//   4. Renovar com grant_type=refresh_token quando o access_token expira.
//
// Todos os endpoints são configuráveis por variável de ambiente para que uma
// eventual mudança de host/caminho na Olist seja resolvida sem alterar código.

import { getStoredTokens, saveTokens, type TinyTokenSet } from "@/lib/services/tiny-tokens";
import type { TinyOrderPayload } from "@/lib/validation/schemas";

export interface TinyConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  ordersPath: string;
  scope: string;
}

const DEFAULTS = {
  authUrl: "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth",
  tokenUrl: "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token",
  apiBaseUrl: "https://api.tiny.com.br/public-api/v3",
  ordersPath: "/pedidos",
  scope: "openid offline_access",
};

export function getTinyConfig(companyId = "nyer"): TinyConfig {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const isEcopro = companyId === "ecopro";
  const prefix = isEcopro ? "ECOPRO_" : "";
  return {
    clientId: process.env[`${prefix}TINY_CLIENT_ID`] || "",
    clientSecret: process.env[`${prefix}TINY_CLIENT_SECRET`] || "",
    redirectUri:
      process.env[`${prefix}TINY_REDIRECT_URI`] ||
      `${appUrl.replace(/\/$/, "")}/api/auth/tiny/callback`,
    authUrl: process.env.TINY_AUTH_URL || DEFAULTS.authUrl,
    tokenUrl: process.env.TINY_TOKEN_URL || DEFAULTS.tokenUrl,
    apiBaseUrl: (process.env.TINY_API_BASE_URL || DEFAULTS.apiBaseUrl).replace(/\/$/, ""),
    ordersPath: process.env.TINY_ORDERS_PATH || DEFAULTS.ordersPath,
    scope: process.env.TINY_SCOPE || DEFAULTS.scope,
  };
}

/** O app tem credenciais de OAuth (client_id + client_secret) configuradas? */
export function isTinyConfigured(companyId = "nyer"): boolean {
  const c = getTinyConfig(companyId);
  return Boolean(c.clientId && c.clientSecret);
}

/** URL para iniciar o consentimento OAuth no Tiny. */
export function buildAuthorizationUrl(state: string, companyId = "nyer", redirectUriOverride?: string): string {
  const c = getTinyConfig(companyId);
  const url = new URL(c.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("redirect_uri", redirectUriOverride || c.redirectUri);
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Há tokens armazenados (app conectado a uma conta Tiny)? */
export async function isTinyConnected(companyId = "nyer"): Promise<boolean> {
  const tokens = await getStoredTokens(companyId);
  return Boolean(tokens?.access_token);
}

function basicAuthHeader(c: TinyConfig): string {
  return "Basic " + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64");
}

function toTokenSet(raw: Record<string, unknown>): TinyTokenSet {
  const expiresIn = Number(raw.expires_in) || 0;
  // Buffer de 60s para evitar usar um token a ponto de expirar.
  const expiresAt = new Date(Date.now() + Math.max(0, expiresIn - 60) * 1000).toISOString();
  return {
    access_token: String(raw.access_token ?? ""),
    refresh_token: raw.refresh_token ? String(raw.refresh_token) : null,
    expires_at: expiresAt,
    scope: raw.scope ? String(raw.scope) : null,
    obtained_at: new Date().toISOString(),
  };
}

async function postToken(body: Record<string, string>, companyId = "nyer"): Promise<TinyTokenSet> {
  const c = getTinyConfig(companyId);
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(c),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Tiny token endpoint ${res.status}: ${text.slice(0, 300)}`);
  }
  return toTokenSet(JSON.parse(text) as Record<string, unknown>);
}

/** Troca o authorization code (callback) por tokens e persiste. */
export async function exchangeCodeForTokens(code: string, companyId = "nyer", redirectUriOverride?: string): Promise<TinyTokenSet> {
  const c = getTinyConfig(companyId);
  const tokens = await postToken({
    grant_type: "authorization_code",
    code,
    // Precisa ser IDÊNTICO ao usado na autorização (senão o Tiny recusa).
    redirect_uri: redirectUriOverride || c.redirectUri,
  }, companyId);
  await saveTokens(tokens, companyId);
  return tokens;
}

/** Renova os tokens a partir de um refresh_token e persiste. */
export async function refreshTokens(refreshToken: string, companyId = "nyer"): Promise<TinyTokenSet> {
  const tokens = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }, companyId);
  // O Keycloak nem sempre devolve um novo refresh_token; preserva o anterior.
  if (!tokens.refresh_token) tokens.refresh_token = refreshToken;
  await saveTokens(tokens, companyId);
  return tokens;
}

function isExpired(tokens: TinyTokenSet): boolean {
  return !tokens.expires_at || new Date(tokens.expires_at).getTime() <= Date.now();
}

/**
 * Retorna um access_token válido, renovando via refresh_token se necessário.
 * Lança erro se o app não estiver conectado (sem tokens) — chame após isTinyConnected().
 */
export async function getValidAccessToken(companyId = "nyer"): Promise<string> {
  let tokens = await getStoredTokens(companyId);
  if (!tokens || !tokens.access_token) {
    throw new Error(`Olist Tiny (${companyId}) não conectado. Conclua o OAuth em /api/auth/tiny/login.`);
  }
  if (isExpired(tokens)) {
    if (!tokens.refresh_token) {
      throw new Error(`Token do Tiny (${companyId}) expirado e sem refresh_token. Reconecte o app.`);
    }
    tokens = await refreshTokens(tokens.refresh_token, companyId);
  }
  return tokens.access_token;
}

/**
 * Requisição autenticada à API V3.
 *  - Renova o token uma vez em caso de 401.
 *  - Em caso de 429 (rate limit do Tiny), espera e tenta de novo (backoff),
 *    respeitando o header Retry-After quando presente. O limite do Tiny V3 é
 *    baixo, então sem isso as operações em lote (sync, criação de pedido com
 *    várias buscas de produto) falham com frequência.
 *  - companyId: "nyer" (padrão) ou "ecopro" — determina qual conta Tiny usar.
 */
export async function tinyFetch(path: string, init: RequestInit = {}, companyId = "nyer"): Promise<Response> {
  const c = getTinyConfig(companyId);
  const url = path.startsWith("http") ? path : `${c.apiBaseUrl}${path}`;

  const doFetch = async (token: string) =>
    fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.headers || {}),
      },
      cache: "no-store",
    });

  let token = await getValidAccessToken(companyId);
  let res = await doFetch(token);

  if (res.status === 401) {
    const tokens = await getStoredTokens(companyId);
    if (tokens?.refresh_token) {
      token = (await refreshTokens(tokens.refresh_token, companyId)).access_token;
      res = await doFetch(token);
    }
  }

  // Retry em 429 com backoff exponencial (até 4 tentativas extras).
  for (let attempt = 1; res.status === 429 && attempt <= 4; attempt++) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 1000 * Math.pow(2, attempt - 1)); // 1s, 2s, 4s, 8s
    await new Promise((r) => setTimeout(r, waitMs));
    res = await doFetch(token);
  }

  return res;
}

export interface DespachoResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * Atualiza os dados de DESPACHO de um pedido no Tiny (V3): transportadora, valor
 * do frete, rastreio. Endpoint dedicado `PUT /pedidos/{id}/despacho` — mexe só no
 * despacho, não sobrescreve o pedido. Best-effort: devolve status + corpo cru
 * para ajustarmos o payload conforme a resposta real.
 */
export async function atualizarDespacho(
  tinyId: string,
  payload: Record<string, unknown>,
): Promise<DespachoResult> {
  const c = getTinyConfig();
  const res = await tinyFetch(`${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}/despacho`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.text()).slice(0, 1000);
  return { ok: res.ok, status: res.status, body };
}

export interface FormaEnvio {
  id: number;
  nome: string;
  ativo?: boolean;
}

/** Lista as formas de envio cadastradas no Tiny (para mapear transportadora → idFormaEnvio). */
export async function listarFormasEnvio(): Promise<FormaEnvio[]> {
  const c = getTinyConfig();
  const res = await tinyFetch(`${c.apiBaseUrl}/formas-envio?limit=100`);
  if (!res.ok) return [];
  const json = (await res.json().catch(() => null)) as { itens?: FormaEnvio[] } | null;
  return json?.itens ?? [];
}

function normalizarNome(s: string): string {
  // NFD separa os acentos em marcas combinantes; [^a-z0-9] remove acentos,
  // espaços e pontuação. Por fim, colapsa letras consecutivas repetidas para
  // tolerar variações de grafia (ex.: "Braspress" ↔ "BrassPress").
  return s
    .normalize("NFD")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .replace(/(.)\1+/g, "$1");
}

// Apelidos por provider: o nome exato (ou aproximado) da forma de envio
// cadastrada no Tiny do cliente, quando difere do rótulo da cotação.
const FORMA_ENVIO_ALIASES: Record<string, string[]> = {
  braspress: ["BrassPress"],
  jadlog: ["Jadlog"],
  arlete: ["Arlete Transportes Tubarão"],
  lenoir: ["LENOIR Transportadora", "Lenoir Transportadora"],
};

export interface TinyTransporteMap {
  /** Forma de envio (formaEnvio.id) — o dropdown "Forma de envio" do pedido. */
  idFormaEnvio: number;
  /** Forma de frete (formaFrete.id) — aninhada na forma de envio (ex.: PAC/SEDEX). */
  idFormaFrete?: number;
  /** Contato da transportadora (idContatoTransportadora) — o campo "Nome". */
  idContato?: number;
}

// Mapa fixo transportadora → IDs do Tiny. É FIXO de propósito: o cadastro do
// cliente tem nomes duplicados (várias "Lenoir" como forma de envio E como
// contato), então casar por nome é ambíguo e arriscado. Para mapear uma nova
// transportadora, rode o dump de descoberta e preencha aqui:
//   /api/debug/tiny-transporte?dump=1&nome=<transportadora>
const CARRIER_TINY_MAP: Record<string, TinyTransporteMap> = {
  lenoir: { idFormaEnvio: 788687424, idFormaFrete: 788687425, idContato: 759159776 },
  braspress: { idFormaEnvio: 790700150, idContato: 752689402 }, // sem forma de frete
  arlete: { idFormaEnvio: 822957035, idContato: 757356999 }, // sem forma de frete
  jadlog: { idFormaEnvio: 775070531, idFormaFrete: 885640292, idContato: 752318920 }, // .PACKAGE
};

/** Procura no mapa pela chave do provider ou pelo rótulo normalizado. */
function resolverMapaTransporte(carrierLabel: string, provider?: string): TinyTransporteMap | null {
  const chaves = [provider, carrierLabel].filter(Boolean).map((s) => String(s).toLowerCase().trim());
  for (const k of chaves) {
    if (CARRIER_TINY_MAP[k]) return CARRIER_TINY_MAP[k];
  }
  // tolera variações de grafia do rótulo (ex.: "Lenoir Transportadora" → lenoir)
  const alvo = normalizarNome(carrierLabel);
  for (const [k, v] of Object.entries(CARRIER_TINY_MAP)) {
    if (alvo.includes(normalizarNome(k))) return v;
  }
  return null;
}

export interface FormaEnvioMatch {
  /** Forma de envio do Tiny que casou com a transportadora (null se nenhuma). */
  match: FormaEnvio | null;
  /** Todas as formas de envio cadastradas (para diagnóstico quando não casa). */
  formas: FormaEnvio[];
}

/**
 * Casa o rótulo da transportadora (+ apelidos do provider) com uma das formas
 * de envio cadastradas no Tiny: 1) match exato normalizado; 2) match por
 * inclusão, mas só se for único (evita escolher errado entre nomes parecidos).
 */
export async function resolverFormaEnvio(
  carrierLabel: string,
  provider?: string,
): Promise<FormaEnvioMatch> {
  const formas = await listarFormasEnvio();
  const alvos = [
    carrierLabel,
    ...(provider ? FORMA_ENVIO_ALIASES[provider.toLowerCase()] ?? [] : []),
  ].map(normalizarNome);

  let match = formas.find((f) => alvos.includes(normalizarNome(f.nome))) ?? null;
  if (!match) {
    const candidatos = formas.filter((f) => {
      const n = normalizarNome(f.nome);
      return n.length > 2 && alvos.some((a) => n.includes(a) || a.includes(n));
    });
    if (candidatos.length === 1) match = candidatos[0];
  }
  return { match, formas };
}

export interface TransporteTinyResult {
  ok: boolean;
  status?: number;
  body?: string;
  formaEnvioNome?: string | null;
  idFormaEnvio?: number | null;
  formasDisponiveis?: string[];
  transporteStatus?: number;
  transporteBody?: string;
  transporte?: unknown;
  pedidoKeys?: string[];
  pedidoRaw?: string;
  getStatus?: number;
}

export interface GravarTransporteOpts {
  provider?: string;
  /** Nº de volumes definido no nosso sistema. */
  volumes?: number;
  /** Valor do frete cotado. */
  frete?: number;
  /** Prazo cotado em dias (vira a data prevista de entrega no Tiny). */
  prazoDias?: number;
}

/** Data (YYYY-MM-DD) daqui a `dias` dias, no formato usado pelo Tiny. */
function dataPrevistaDeDias(dias?: number): string | undefined {
  if (dias == null || !Number.isFinite(dias) || dias <= 0) return undefined;
  const d = new Date();
  d.setDate(d.getDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
}

/**
 * Grava a transportadora no pedido do Tiny via `PUT /pedidos/{id}/despacho`
 * (endpoint e campos confirmados pelo schema real AtualizarInfoRastreamentoPedido):
 *   - `formaEnvio.id`            → Forma de envio
 *   - `formaFrete.id`            → Forma de frete
 *   - `idContatoTransportadora`  → o campo "Nome" (contato cadastrado)
 *   - `volumes`, `fretePagoEmpresa`, `dataPrevista`
 *
 * Usa um mapa FIXO de IDs por transportadora (CARRIER_TINY_MAP), porque o cadastro
 * do cliente tem nomes duplicados e casar por nome escolheria a forma errada. Se a
 * transportadora não estiver mapeada, não escreve (evita gravar a forma errada).
 *
 * Se o pedido estiver preso numa expedição, o Tiny recusa alterar volumes; nesse
 * caso refaz a chamada sem `volumes` para ao menos gravar forma de envio/frete/nome.
 */
export async function gravarTransporteNoTiny(
  tinyId: string,
  carrierLabel: string,
  opts: GravarTransporteOpts = {},
): Promise<TransporteTinyResult> {
  const { provider, volumes, frete, prazoDias } = opts;
  const mapeado = resolverMapaTransporte(carrierLabel, provider);
  if (!mapeado) {
    return {
      ok: false,
      formaEnvioNome: null,
      idFormaEnvio: null,
      body: `Transportadora "${carrierLabel}" não mapeada no Tiny (CARRIER_TINY_MAP).`,
    };
  }

  const c = getTinyConfig();
  const despachoUrl = `${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}/despacho`;
  const pedidoUrl = `${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`;
  const dataPrevista = dataPrevistaDeDias(prazoDias);

  const montarPayload = (incluirVolumes: boolean): Record<string, unknown> => ({
    formaEnvio: { id: mapeado.idFormaEnvio },
    ...(mapeado.idFormaFrete != null ? { formaFrete: { id: mapeado.idFormaFrete } } : {}),
    ...(mapeado.idContato != null ? { idContatoTransportadora: mapeado.idContato } : {}),
    ...(incluirVolumes && volumes != null ? { volumes } : {}),
    ...(frete != null ? { fretePagoEmpresa: frete } : {}),
    ...(dataPrevista ? { dataPrevista } : {}),
  });

  let enviado = montarPayload(true);
  let res = await tinyFetch(despachoUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enviado),
  });
  let body = (await res.text()).slice(0, 800);
  // Pedido preso em expedição → não dá pra mexer em volume; refaz sem volumes.
  if (!res.ok && volumes != null && /expedi|volume/i.test(body)) {
    enviado = montarPayload(false);
    res = await tinyFetch(despachoUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enviado),
    });
    body = (await res.text()).slice(0, 800);
  }

  // Relê o pedido para confirmar o que ficou gravado (transportador/valorFrete).
  let transporte: unknown;
  let pedidoKeys: string[] | undefined;
  let pedidoRaw: string | undefined;
  let getStatus: number | undefined;
  try {
    const gres = await tinyFetch(pedidoUrl);
    getStatus = gres.status;
    if (gres.ok) {
      const ped = (await gres.json().catch(() => null)) as Record<string, unknown> | null;
      if (ped) {
        transporte = {
          transportador: ped.transportador ?? null,
          valorFrete: ped.valorFrete ?? null,
          dataPrevista: ped.dataPrevista ?? null,
        };
        pedidoKeys = Object.keys(ped);
        // Diagnóstico rico: marcador da versão (via=despacho), o que foi enviado,
        // a situação/NF do pedido (pra ver se está travado por faturamento) e o
        // transportador resultante.
        pedidoRaw = JSON.stringify(
          {
            via: "despacho",
            enviado,
            despachoStatus: res.status,
            despachoBody: body,
            situacao: ped.situacao ?? ped.codigoSituacao ?? ped.descricaoSituacao ?? null,
            idNotaFiscal: ped.idNotaFiscal ?? null,
            transportador: ped.transportador ?? null,
            valorFrete: ped.valorFrete ?? null,
            dataPrevista: ped.dataPrevista ?? null,
          },
          null,
          2,
        ).slice(0, 2500);
      }
    }
  } catch {
    /* leitura best-effort; ignora falha */
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
    formaEnvioNome: carrierLabel,
    idFormaEnvio: mapeado.idFormaEnvio,
    transporteStatus: res.status,
    transporteBody: body,
    transporte,
    pedidoKeys,
    pedidoRaw,
    getStatus,
  };
}

// ───────────────── Teste de gravação de transporte (diagnóstico) ─────────────────
// Sondagem das duas abordagens sugeridas pelo suporte do Tiny para gravar a
// transportadora num pedido SEM nota fiscal:
//   A) PUT /pedidos/{id}/despacho com { formaEnvio: { id }, volumes }
//   B) POST /expedicao com { idsPedidos: [id], idFormaEnvio }
// Cada tentativa relê o pedido depois, para vermos se o `transportador` foi
// realmente gravado (e não apenas aceito com 2xx e ignorado).

export interface TentativaTransporte {
  status: number;
  body: string;
  /** Estado do transportador/frete do pedido APÓS a tentativa. */
  depois: unknown;
}

export interface TesteTransporteTiny {
  formaEnvioNome: string | null;
  idFormaEnvio: number | null;
  /** Listado só quando nenhuma forma de envio casou (diagnóstico). */
  formasDisponiveis?: string[];
  /** Estado do transportador/frete ANTES de qualquer tentativa. */
  antes: unknown;
  despacho?: TentativaTransporte;
  expedicao?: TentativaTransporte;
}

// Lê do pedido só os campos de transporte que nos interessam para o diagnóstico.
async function lerTransportadorPedido(pedidoUrl: string): Promise<unknown> {
  try {
    const r = await tinyFetch(pedidoUrl);
    if (!r.ok) return { getStatus: r.status };
    const p = (await r.json()) as Record<string, any>;
    return {
      transportador: p.transportador ?? null,
      valorFrete: p.valorFrete ?? null,
      volumes: p.volumes ?? p.qtdVolumes ?? p.transportador?.volumes ?? null,
      fretePagoEmpresa: p.fretePagoEmpresa ?? p.transportador?.fretePagoEmpresa ?? null,
      dataPrevista: p.dataPrevista ?? null,
    };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

/**
 * DIAGNÓSTICO: descobre as formas de frete (e seus IDs) disponíveis. Tenta, em
 * ordem: o item cru da forma de envio escolhida (pode trazer as formas de frete
 * embutidas), o detalhe da forma de envio, e um endpoint dedicado /formas-frete.
 * Devolve tudo cru para inspecionarmos a estrutura real da conta.
 */
export async function dumpFormasFreteRaw(
  idFormaEnvio?: number,
  nome?: string,
): Promise<Record<string, unknown>> {
  const c = getTinyConfig();
  const out: Record<string, unknown> = {};

  // 1) Lista todas as formas de envio.
  let formas: any[] = [];
  try {
    const r = await tinyFetch(`${c.apiBaseUrl}/formas-envio?limit=100`);
    out.formasEnvioStatus = r.status;
    if (r.ok) formas = ((await r.json()) as { itens?: any[] }).itens ?? [];
    else out.formasEnvioBody = (await r.text()).slice(0, 400);
  } catch (e) {
    out.formasEnvioErro = (e as Error).message;
  }

  // 2) Seleciona as formas-alvo: por id explícito OU por nome (match normalizado).
  const alvoNome = nome ? normalizarNome(nome) : null;
  const alvos = formas.filter(
    (f) =>
      (idFormaEnvio != null && f.id === idFormaEnvio) ||
      (alvoNome != null && normalizarNome(String(f.nome ?? "")).includes(alvoNome)),
  );

  // 3) Para cada forma-alvo, busca o detalhe (que traz as formasFrete com IDs).
  // A forma de frete NÃO tem endpoint próprio — vem aninhada na forma de envio.
  const formasEnvio: any[] = [];
  for (const f of alvos.slice(0, 10)) {
    let formasFrete: Array<{ id: unknown; nome: unknown }> = [];
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/formas-envio/${f.id}`);
      if (r.ok) {
        const d = (await r.json()) as any;
        formasFrete = (d.formasFrete ?? []).map((ff: any) => ({ id: ff.id, nome: ff.nome }));
      }
    } catch {
      /* ignora; detalhe best-effort */
    }
    formasEnvio.push({ id: f.id, nome: f.nome, situacao: f.situacao, formasFrete });
  }
  out.formasEnvio = formasEnvio;

  // 4) Contatos (o campo "Nome" = idContatoTransportadora) que batem com o nome.
  if (nome) {
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/contatos?nome=${encodeURIComponent(nome)}&limit=20`);
      out.contatosStatus = r.status;
      if (r.ok) {
        const j = (await r.json()) as { itens?: any[] };
        out.contatos = (j.itens ?? []).map((ct) => ({
          id: ct.id,
          nome: ct.nome,
          tipo: ct.tipo ?? ct.tipoPessoa ?? null,
        }));
      } else {
        out.contatosBody = (await r.text()).slice(0, 400);
      }
    } catch (e) {
      out.contatosErro = (e as Error).message;
    }
  }

  return out;
}

/**
 * Testa, de forma isolada e diagnóstica, as duas abordagens do suporte do Tiny
 * para gravar a transportadora num pedido sem NF. NÃO usar no fluxo de
 * produção: a abordagem B cria um registro de expedição (efeito colateral).
 */
export async function testarTransporteTiny(
  tinyId: string,
  carrierLabel: string,
  opts: {
    provider?: string;
    volumes?: number;
    idFormaEnvio?: number;
    /** Forma de frete (formaFrete.id) — ex.: "Transportadora Mais Rápida". */
    idFormaFrete?: number;
    /** Contato da transportadora (idContatoTransportadora = campo "Nome"). */
    idContato?: number;
    /** Valor do frete a gravar (fretePagoEmpresa, R$). */
    frete?: number;
    /** Também testar POST /expedicao (cria registro de expedição). Default: não. */
    testarExpedicao?: boolean;
  } = {},
): Promise<TesteTransporteTiny> {
  const { provider, volumes, idFormaEnvio, idFormaFrete, idContato, frete, testarExpedicao } = opts;
  const { match: autoMatch, formas } = await resolverFormaEnvio(carrierLabel, provider);
  // Um idFormaEnvio explícito tem prioridade — desambigua quando o cadastro tem
  // nomes repetidos (ex.: duas "Lenoir"). Senão, usa o match automático.
  const match: FormaEnvio | null =
    idFormaEnvio != null
      ? formas.find((f) => f.id === idFormaEnvio) ?? { id: idFormaEnvio, nome: `id:${idFormaEnvio}` }
      : autoMatch;
  const c = getTinyConfig();
  const pedidoUrl = `${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`;

  const out: TesteTransporteTiny = {
    formaEnvioNome: match?.nome ?? null,
    idFormaEnvio: match?.id ?? null,
    // Lista "id — nome" para podermos escolher por ID quando há nomes repetidos.
    formasDisponiveis: match ? undefined : formas.map((f) => `${f.id} — ${f.nome}`),
    antes: await lerTransportadorPedido(pedidoUrl),
  };
  if (!match) return out;

  // Abordagem A — PUT /pedidos/{id}/despacho. Confirmado que `formaEnvio` (objeto)
  // grava a forma de envio. Aqui mandamos o payload COMPLETO para também tentar
  // preencher o Nome do transportador, o frete e os volumes (campos do print).
  // Campos conforme o schema real (AtualizarInfoRastreamentoPedidoModelRequest):
  // formaEnvio.id, formaFrete.id, idContatoTransportadora, volumes, fretePagoEmpresa.
  const despachoPayload: Record<string, unknown> = {
    formaEnvio: { id: match.id },
    ...(idFormaFrete != null ? { formaFrete: { id: idFormaFrete } } : {}),
    ...(idContato != null ? { idContatoTransportadora: idContato } : {}),
    ...(volumes != null ? { volumes } : {}),
    ...(frete != null ? { fretePagoEmpresa: frete } : {}),
  };
  try {
    const r = await tinyFetch(`${pedidoUrl}/despacho`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(despachoPayload),
    });
    out.despacho = {
      status: r.status,
      body: (await r.text()).slice(0, 600),
      depois: await lerTransportadorPedido(pedidoUrl),
    };
  } catch (e) {
    out.despacho = { status: 0, body: (e as Error).message, depois: null };
  }

  // Abordagem B — POST /expedicao (cria um registro de expedição). Só roda sob
  // demanda, pois tem efeito colateral; o /despacho já resolve sem criar nada.
  if (testarExpedicao) {
    try {
      const r = await tinyFetch(`${c.apiBaseUrl}/expedicao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idsPedidos: [Number(tinyId)], idFormaEnvio: match.id }),
      });
      out.expedicao = {
        status: r.status,
        body: (await r.text()).slice(0, 600),
        depois: await lerTransportadorPedido(pedidoUrl),
      };
    } catch (e) {
      out.expedicao = { status: 0, body: (e as Error).message, depois: null };
    }
  }

  return out;
}

// A V3 representa a situação do pedido por um código numérico; traduzimos para
// um rótulo legível (mantém o número como fallback se vier algo fora da tabela).
const SITUACAO_LABELS: Record<string, string> = {
  "0": "em aberto",
  "1": "faturado",
  "2": "cancelado",
  "3": "aprovado",
  "4": "preparando envio",
  "5": "enviado",
  "6": "entregue",
  "7": "pronto para envio",
  "8": "dados incompletos",
  "9": "não entregue",
};

/**
 * Normaliza um pedido vindo da API V3 para o formato esperado por ingestOrder
 * (mesmos campos do webhook). É best-effort e tolerante: o payload bruto é
 * sempre preservado, então campos não mapeados não se perdem. Pode precisar de
 * ajuste fino após inspecionar o primeiro payload real da conta.
 */
export function mapV3OrderToPayload(v3: Record<string, any>): TinyOrderPayload {
  const cliente = v3.cliente ?? v3.contato ?? {};
  // Pega o 1º valor NÃO-VAZIO. Importante porque o Tiny manda campos como
  // `celular: ""` (vazio, mas presente) — e o `??` deixaria a string vazia
  // passar, mascarando o `telefone` preenchido.
  const pick = (...vals: unknown[]): string | undefined => {
    for (const v of vals) if (v != null && String(v).trim() !== "") return String(v).trim();
    return undefined;
  };
  const endereco = cliente.endereco ?? {};
  const ecommerce = v3.ecommerce ?? (v3.nomeEcommerce ? { nome: v3.nomeEcommerce } : undefined);
  const itensRaw: any[] = v3.itens ?? v3.itensPedido ?? v3.items ?? v3.produtos ?? [];

  // A V3 usa `situacao` (numérico) na listagem, mas o endpoint de detalhe
  // (busca por id) devolve `codigoSituacao`/`descricaoSituacao` (ex.: "enviado").
  const situacaoRaw = v3.situacao ?? v3.status ?? v3.codigoSituacao ?? v3.descricaoSituacao;
  const situacao =
    situacaoRaw == null
      ? undefined
      : SITUACAO_LABELS[String(situacaoRaw)] ?? String(situacaoRaw);

  const transportadora =
    v3.transportador?.formaEnvio?.nome ?? // estrutura real da V3
    v3.transportador?.nome ??
    v3.transportadora?.nome ??
    v3.nomeTransportador ??
    (typeof v3.transportadora === "string" ? v3.transportadora : undefined) ??
    v3.formaEnvio?.nome ??
    v3.formaEnvio?.descricao; // detalhe V3: { formaEnvio: { descricao: "Retirar pessoalmente" } }

  return {
    id: v3.id ?? v3.idPedido,
    numero: v3.numeroPedido ?? v3.numero ?? v3.id,
    numero_ecommerce:
      ecommerce?.numeroPedidoEcommerce ?? v3.numeroPedidoEcommerce ?? v3.numeroEcommerce ?? null,
    situacao,
    valor: v3.valor ?? v3.valorTotal ?? v3.totalPedido,
    ecommerce: ecommerce ? { nome: ecommerce.nome ?? ecommerce.canalVenda } : undefined,
    marcadores: v3.marcadores,
    cliente: {
      nome: pick(cliente.nome, cliente.razaoSocial, cliente.fantasia),
      cpf_cnpj: pick(cliente.cpfCnpj, cliente.cpf_cnpj, cliente.documento),
      email: cliente.email,
      fone: pick(cliente.celular, cliente.telefone, cliente.fone),
      endereco:
        endereco.endereco ??
        endereco.logradouro ??
        (typeof cliente.endereco === "string" ? cliente.endereco : undefined),
      cidade: endereco.municipio ?? endereco.cidade ?? cliente.cidade ?? cliente.municipio,
      uf: endereco.uf ?? cliente.uf,
    },
    vendedor: v3.vendedor?.nome ?? v3.vendedor ?? v3.nomeVendedor,
    lista_preco: v3.listaPreco?.nome ?? v3.listaPreco,
    transportadora,
    // Data real do pedido no Tiny.
    data: v3.dataCriacao ?? (typeof v3.data === "string" && v3.data.length >= 8 ? v3.data : undefined),
    // Vencimento do boleto — vem só no detalhe do pedido.
    vencimento:
      v3.formasPagamento?.[0]?.vencimento ??
      v3.formasPagamento?.[0]?.dataVencimento ??
      v3.parcelas?.[0]?.vencimento ??
      v3.vencimento ??
      undefined,
    itens: itensRaw.map((it: any) => ({
      codigo: it.codigo ?? it.sku ?? it.codigoProduto ?? it.produto?.codigo ?? it.produto?.sku ?? it.produto?.codigoProduto,
      descricao: it.descricao ?? it.nomeProduto ?? it.produto?.descricao ?? it.produto?.nome ?? it.nome,
      quantidade: it.quantidade ?? it.qtd ?? it.qtde,
      valor_unitario: it.valorUnitario ?? it.valor_unitario ?? it.precoUnitario ?? it.valor,
    })),
    raw_payload: v3,
  } as TinyOrderPayload;
}

export interface FetchRecentParams {
  /** Data inicial de criação (YYYY-MM-DD). */
  dataInicial?: string;
  /** Data final de criação (YYYY-MM-DD). */
  dataFinal?: string;
  /** Código de situação (0..9) para filtrar (opcional). */
  situacao?: number;
  limit?: number;
  offset?: number;
}

/** Busca pedidos na API V3 por intervalo de datas e devolve já normalizados. */
export async function fetchRecentOrders(params: FetchRecentParams = {}, companyId = "nyer"): Promise<TinyOrderPayload[]> {
  const c = getTinyConfig(companyId);
  const url = new URL(`${c.apiBaseUrl}${c.ordersPath}`);
  if (params.dataInicial) url.searchParams.set("dataInicial", params.dataInicial);
  if (params.dataFinal) url.searchParams.set("dataFinal", params.dataFinal);
  if (params.situacao != null) url.searchParams.set("situacao", String(params.situacao));
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const res = await tinyFetch(url.toString(), {}, companyId);
  if (!res.ok) {
    throw new Error(`Tiny pedidos ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as Record<string, any>;
  const items: any[] = json.itens ?? json.data ?? json.pedidos ?? (Array.isArray(json) ? json : []);
  return items.map(mapV3OrderToPayload);
}

export interface TinyOrderNF {
  numero: string | null;
  chave: string | null;
  qtdVolumes: number | null;
  codigoRastreamento: string | null;
  urlRastreamento: string | null;
  /** Valor do frete do pedido (R$). */
  valorFrete: number | null;
  /** Data prevista de entrega (ISO, fim do dia) — vira a SLA do pedido. */
  dataPrevista: string | null;
}

// Converte uma data do Tiny ("YYYY-MM-DD" ou "DD/MM/YYYY") em ISO no fim do dia
// (23:59 no horário de Brasília) — usada como prazo/limite de entrega (SLA).
function tinyDateToDeadlineIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y: string, m: string, d: string;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (iso) {
    [, y, m, d] = iso;
  } else if (br) {
    [, d, m, y] = br;
  } else {
    return null;
  }
  return `${y}-${m}-${d}T23:59:59-03:00`;
}

/**
 * Busca a nota fiscal de um pedido: detalhe do pedido (idNotaFiscal) →
 * GET /notas/{id} (chaveAcesso, numero). Também captura o frete e a data
 * prevista de entrega do pedido. Retorna null se o pedido não tiver NF.
 */
export async function fetchOrderNF(tinyId: string): Promise<TinyOrderNF | null> {
  const c = getTinyConfig();
  const dres = await tinyFetch(`${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`);
  if (!dres.ok) return null;
  const pedido = (await dres.json()) as Record<string, any>;
  const idNF = pedido?.idNotaFiscal;
  if (!idNF) return null;

  const valorFreteRaw = pedido?.valorFrete ?? pedido?.valor_frete;
  const valorFrete = valorFreteRaw != null && valorFreteRaw !== "" ? Number(valorFreteRaw) : null;
  const dataPrevista =
    tinyDateToDeadlineIso(pedido?.dataPrevista) ??
    tinyDateToDeadlineIso(pedido?.dataEntrega) ??
    null;

  const nres = await tinyFetch(`${c.apiBaseUrl}/notas/${encodeURIComponent(String(idNF))}`);
  if (!nres.ok) return null;
  const nota = (await nres.json()) as Record<string, any>;
  const n = nota?.nota ?? nota?.data ?? nota;
  return {
    numero: n?.numero != null ? String(n.numero) : null,
    chave: n?.chaveAcesso ?? n?.chave ?? n?.chaveNfe ?? null,
    qtdVolumes: n?.qtdVolumes != null ? Number(n.qtdVolumes) : null,
    codigoRastreamento: n?.codigoRastreamento || null,
    urlRastreamento: n?.urlRastreamento || null,
    valorFrete: valorFrete != null && Number.isFinite(valorFrete) ? valorFrete : null,
    dataPrevista,
  };
}

/**
 * Busca o link do documento (DANFE) da NF de um pedido:
 * detalhe do pedido (idNotaFiscal) → GET /notas/{id}/link → { link }.
 */
export async function fetchNfDocLink(tinyId: string): Promise<string | null> {
  const c = getTinyConfig();
  const dres = await tinyFetch(`${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`);
  if (!dres.ok) return null;
  const pedido = (await dres.json()) as Record<string, any>;
  const idNF = pedido?.idNotaFiscal;
  if (!idNF) return null;

  const lres = await tinyFetch(`${c.apiBaseUrl}/notas/${encodeURIComponent(String(idNF))}/link`);
  if (!lres.ok) return null;
  const data = (await lres.json()) as Record<string, any>;
  return data?.link ?? data?.url ?? null;
}

// ───────────────── Peso bruto (cotação de frete) ─────────────────

function numAny(v: unknown): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Procura recursivamente, num objeto, a 1ª chave de "peso bruto" (pesoBruto,
// peso_bruto, peso_bruto_kg…) e devolve o valor numérico. Não desce em arrays
// (para não pegar peso por-item quando queremos o peso do produto/unidade).
function deepFindGrossWeight(obj: unknown, depth = 0): number {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || depth > 6) return 0;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const [k, v] of entries) {
    if (/peso.?bruto/i.test(k)) {
      const n = numAny(v);
      if (n > 0) return n;
    }
  }
  for (const [, v] of entries) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const n = deepFindGrossWeight(v, depth + 1);
      if (n > 0) return n;
    }
  }
  return 0;
}

export interface TinyOrderWeight {
  /** Peso bruto total do pedido em kg (null se não encontrado). */
  pesoBruto: number | null;
  /** Quantidade de volumes da NF, se disponível. */
  volumes: number | null;
  /** CEP do destinatário (entrega), para a cotação de frete. */
  cepDestino: string | null;
  /** Estratégia usada (diagnóstico). */
  source: string | null;
  /** Diagnóstico opcional (chaves cruas) qudo solicitado. */
  debug?: unknown;
}

/**
 * Busca o PESO BRUTO total de um pedido para a cotação de frete. Tenta, em ordem:
 *  1) campo direto no pedido (qualquer chave "peso bruto")
 *  2) soma dos itens (peso do item × quantidade)
 *  3) consulta o cadastro de cada produto (/produtos/{id}) → peso bruto × quantidade
 *  4) peso bruto da nota fiscal, se já emitida
 * Retorna null quando nada é encontrado (o app mantém a estimativa local).
 */
// Cache de peso bruto por produto (id → kg). O peso do cadastro do produto
// muda raramente, então cacheamos por instância para evitar re-consultas e o
// rate limit (HTTP 429) do Tiny.
const productWeightCache = new Map<string, number>();

// Busca o peso bruto de UM produto no Tiny, com cache e retry em 429 (backoff).
async function fetchProductGrossWeight(
  apiBase: string,
  pid: string,
  debugArr: Array<Record<string, unknown>> | null,
): Promise<number> {
  const cached = productWeightCache.get(pid);
  if (cached !== undefined) return cached;
  for (let attempt = 0; attempt < 3; attempt++) {
    const pres = await tinyFetch(`${apiBase}/produtos/${encodeURIComponent(pid)}`);
    if (pres.status === 429) {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      continue;
    }
    if (!pres.ok) {
      if (debugArr && debugArr.length < 3) debugArr.push({ pid, status: pres.status });
      return 0;
    }
    const pjson = (await pres.json()) as Record<string, any>;
    const prod = pjson?.produto ?? pjson?.data ?? pjson;
    const w = deepFindGrossWeight(prod);
    if (debugArr && debugArr.length < 2) {
      debugArr.push({ pid, dimensoes: prod?.dimensoes ?? null, pesoEncontrado: w });
    }
    productWeightCache.set(pid, w);
    return w;
  }
  if (debugArr && debugArr.length < 3) debugArr.push({ pid, status: 429 });
  return 0;
}

export async function fetchOrderWeight(tinyId: string, opts: { debug?: boolean; companyId?: string } = {}): Promise<TinyOrderWeight> {
  const companyId = opts.companyId ?? "nyer";
  const c = getTinyConfig(companyId);
  const empty: TinyOrderWeight = { pesoBruto: null, volumes: null, cepDestino: null, source: null };

  const dres = await tinyFetch(`${c.apiBaseUrl}/pedidos/${encodeURIComponent(tinyId)}`, {}, companyId);
  if (!dres.ok) return { ...empty, debug: opts.debug ? { pedidoStatus: dres.status } : undefined };
  const raw = (await dres.json()) as Record<string, any>;
  // Só "desembrulha" se pedido/data forem OBJETOS — senão o campo "data" (a data
  // do pedido, uma string) seria confundido com o próprio pedido.
  const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const pedido = isObj(raw?.pedido) ? raw.pedido : isObj(raw?.data) ? raw.data : raw;
  const itens: any[] = (Array.isArray(pedido?.itens) ? pedido.itens : Array.isArray(pedido?.items) ? pedido.items : []) as any[];

  // CEP do destinatário (entrega) — usa o endereço de entrega; senão o do cliente.
  const endEntrega = isObj(pedido?.enderecoEntrega) ? pedido.enderecoEntrega : null;
  const endCliente = isObj(pedido?.cliente?.endereco) ? pedido.cliente.endereco : null;
  const cepRaw = endEntrega?.cep ?? endCliente?.cep ?? null;
  const cepDestino = cepRaw ? String(cepRaw).trim() : null;

  const debug: Record<string, unknown> = {};
  if (opts.debug) {
    debug.tinyId = tinyId;
    debug.pedidoKeys = Object.keys(pedido ?? {});
    debug.itensCount = itens.length;
    debug.item0 = itens[0] ?? null;
    debug.idNotaFiscal = pedido?.idNotaFiscal ?? null;
    debug.pesoNoPedido = deepFindGrossWeight(pedido);
  }

  // 1) campo direto no nível do pedido (busca recursiva por "peso bruto")
  let peso = deepFindGrossWeight(pedido);
  let source = peso > 0 ? "pedido" : null;

  // 2) soma a partir dos próprios itens (quando o item já traz o peso)
  if (peso <= 0 && itens.length) {
    let sum = 0;
    for (const it of itens) {
      const w = deepFindGrossWeight(it);
      const q = numAny(it?.quantidade ?? it?.qtd) || 1;
      if (w > 0) sum += w * q;
    }
    if (sum > 0) {
      peso = sum;
      source = "itens";
    }
  }

  // 3) consulta o cadastro de cada produto e soma peso bruto × quantidade.
  // Agrupa a quantidade por produto (menos chamadas) e busca SEQUENCIALMENTE
  // com cache + retry — consultas em paralelo tomavam rate limit (429) do Tiny.
  if (peso <= 0 && itens.length) {
    const qtyByPid = new Map<string, number>();
    for (const it of itens) {
      const pid = it?.produto?.id ?? it?.idProduto ?? it?.produto?.idProduto ?? it?.id;
      if (!pid) continue;
      const q = numAny(it?.quantidade ?? it?.qtd) || 1;
      const key = String(pid);
      qtyByPid.set(key, (qtyByPid.get(key) ?? 0) + q);
    }
    const prodDebug: Array<Record<string, unknown>> = [];
    let sum = 0;
    for (const [pid, q] of qtyByPid) {
      const w = await fetchProductGrossWeight(c.apiBaseUrl, pid, opts.debug ? prodDebug : null);
      if (w > 0) sum += w * q;
    }
    if (opts.debug) debug.produtos = prodDebug;
    if (sum > 0) {
      peso = sum;
      source = "produtos";
    }
  }

  // 4) peso bruto da nota fiscal (se já emitida) + nº de volumes
  let volumes: number | null = null;
  const idNF = pedido?.idNotaFiscal;
  if (idNF) {
    try {
      const nres = await tinyFetch(`${c.apiBaseUrl}/notas/${encodeURIComponent(String(idNF))}`);
      if (nres.ok) {
        const nota = (await nres.json()) as Record<string, any>;
        const n = nota?.nota ?? nota?.data ?? nota;
        if (n?.qtdVolumes != null) volumes = Number(n.qtdVolumes) || null;
        if (opts.debug) debug.notaKeys = Object.keys(n ?? {});
        if (peso <= 0) {
          const nfPeso = deepFindGrossWeight(n);
          if (nfPeso > 0) {
            peso = nfPeso;
            source = "nota_fiscal";
          }
        }
      }
    } catch {
      /* sem NF disponível */
    }
  }

  return {
    pesoBruto: peso > 0 ? Math.round(peso * 1000) / 1000 : null,
    volumes,
    cepDestino,
    source,
    debug: opts.debug ? debug : undefined,
  };
}

/** Busca um pedido específico por id na API V3 e devolve normalizado. */
export async function fetchOrderById(id: string, companyId = "nyer"): Promise<TinyOrderPayload | null> {
  const c = getTinyConfig(companyId);
  const res = await tinyFetch(`${c.apiBaseUrl}${c.ordersPath}/${encodeURIComponent(id)}`, {}, companyId);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Tiny pedido ${id} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  let json: any = await res.json();
  if (typeof json === "string") {
    try {
      json = JSON.parse(json);
    } catch {
      /* mantém string */
    }
  }
  // Desembrulha SÓ se for objeto: o detalhe da V3 vem direto (raw = pedido), e
  // `data` é a DATA do pedido (string) — não pode ser confundida com o envelope.
  const isObj = (v: unknown) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const ped = isObj(json.pedido) ? json.pedido : isObj(json.data) ? json.data : json;
  return mapV3OrderToPayload(ped);
}

export interface TinyPayable {
  tiny_id: string;
  supplier: string;
  description: string | null;
  value: number;
  issue_date: string | null;
  due_date: string;
  paid_at: string | null;
  category: string | null;
}

function parseTinyDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

export async function fetchTinyPayables(params: {
  dataInicial?: string;
  dataFinal?: string;
  situacao?: number; // 1=aberto, 2=pago, 3=vencido (Tiny V3)
  offset?: number;
  limit?: number;
}): Promise<TinyPayable[]> {
  const c = getTinyConfig();
  const url = new URL(`${c.apiBaseUrl}/contas-pagar`);
  if (params.dataInicial) url.searchParams.set("dataVencimentoInicial", params.dataInicial);
  if (params.dataFinal) url.searchParams.set("dataVencimentoFinal", params.dataFinal);
  if (params.situacao != null) url.searchParams.set("situacao", String(params.situacao));
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const res = await tinyFetch(url.toString());
  if (!res.ok) throw new Error(`Tiny contas-pagar ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as Record<string, any>;
  const items: any[] = json.itens ?? json.data ?? (Array.isArray(json) ? json : []);

  return items.map((item: any): TinyPayable => {
    const rawDesc: string = item.historico ?? item.descricao ?? item.observacoes ?? item.complemento ?? "";
    // Extrai fornecedor do padrão "Ref. a NF nº XXXXX, FORNECEDOR (parcela X/X)"
    const supplierFromDesc = rawDesc.match(/,\s*([^,(]+?)(?:\s*\(|$)/)?.[1]?.trim();
    const supplier =
      (item.fornecedor?.nome ??
      item.contato?.nome ??
      item.nomeFornecedor ??
      supplierFromDesc ??
      rawDesc.slice(0, 60)) ||
      "—";
    return {
      tiny_id: String(item.id ?? ""),
      supplier,
      description: rawDesc || null,
      value: parseFloat(String(item.valor ?? item.valorOriginal ?? 0)) || 0,
      issue_date: parseTinyDate(item.dataEmissao ?? item.dataCriacao ?? item.dataLancamento),
      due_date: parseTinyDate(item.dataVencimento ?? item.vencimento) ?? "",
      paid_at: parseTinyDate(item.dataPagamento ?? item.dataBaixa),
      category: item.categoria?.descricao ?? item.categoria ?? null,
    };
  }).filter((p) => p.due_date);
}

export interface TinyReceivable {
  tiny_id: string;
  customer: string;
  description: string | null;
  value: number;
  issue_date: string | null;
  due_date: string;
  received_at: string | null;
  category: string | null;
}

export async function fetchTinyReceivables(params: {
  dataInicial?: string;
  dataFinal?: string;
  situacao?: number; // 1=aberto, 2=recebido, 3=vencido
  offset?: number;
  limit?: number;
  companyId?: string;
}): Promise<TinyReceivable[]> {
  const { companyId = "nyer", ...rest } = params;
  const c = getTinyConfig(companyId);
  const url = new URL(`${c.apiBaseUrl}/contas-receber`);
  if (rest.dataInicial) url.searchParams.set("dataVencimentoInicial", rest.dataInicial);
  if (rest.dataFinal) url.searchParams.set("dataVencimentoFinal", rest.dataFinal);
  if (rest.situacao != null) url.searchParams.set("situacao", String(rest.situacao));
  url.searchParams.set("limit", String(rest.limit ?? 100));
  url.searchParams.set("offset", String(rest.offset ?? 0));

  const res = await tinyFetch(url.toString(), {}, companyId);
  if (!res.ok) throw new Error(`Tiny contas-receber ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as Record<string, any>;
  const items: any[] = json.itens ?? json.data ?? (Array.isArray(json) ? json : []);

  return items.map((item: any): TinyReceivable => {
    const rawDesc: string = item.historico ?? item.descricao ?? item.observacoes ?? item.complemento ?? "";
    const customer =
      (item.cliente?.nome ??
      item.contato?.nome ??
      item.nomeCliente ??
      rawDesc.slice(0, 60)) ||
      "—";
    return {
      tiny_id: String(item.id ?? ""),
      customer,
      description: rawDesc || null,
      value: parseFloat(String(item.valor ?? item.valorOriginal ?? 0)) || 0,
      issue_date: parseTinyDate(item.dataEmissao ?? item.dataCriacao ?? item.dataLancamento),
      due_date: parseTinyDate(item.dataVencimento ?? item.vencimento) ?? "",
      received_at: parseTinyDate(item.dataPagamento ?? item.dataBaixa ?? item.dataRecebimento),
      category: item.categoria?.descricao ?? item.categoria ?? null,
    };
  }).filter((r) => r.due_date);
}

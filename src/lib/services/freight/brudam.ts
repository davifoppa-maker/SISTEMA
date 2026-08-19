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
    apiBaseUrl: API_BASE,
  };
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

  const body = {
    cnpj_remetente: cnpjRemetente,
    cnpj_destinatario: cnpjDestinatario,
    cep_origem: cepOrigem,
    cep_destino: cepDestino,
    valor_mercadoria: params.vlrMercadoria,
    peso: Number(peso.toFixed(3)),
    volumes: params.volumes || 1,
    cubagem: (params.cubagem ?? []).map((d) => ({
      altura: d.altura,
      largura: d.largura,
      comprimento: d.comprimento,
      quantidade: d.volumes,
    })),
  };

  try {
    // Auto-descoberta do endpoint de cotação: o path exato não está na doc que
    // temos; tentamos os candidatos e usamos o 1º que NÃO for 404 (404 = não
    // existe). Um path com resposta útil interrompe a busca. BRUDAM_COTACAO_PATH
    // sobrepõe tudo quando soubermos o caminho certo.
    const override = process.env.BRUDAM_COTACAO_PATH;
    const candidatos = override
      ? [override]
      : ["/cotacao", "/cotacoes", "/frete/cotacao", "/fretes/cotacao", "/frete/simulacao", "/simulacao", "/simulador", "/cotacao/simular", "/frete/simular"];

    let res: Response | null = null;
    let usouPath = "";
    const tentativas: Record<string, number> = {};
    for (const path of candidatos) {
      const r = await fetch(`${c.apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(body),
      });
      tentativas[path] = r.status;
      if (r.status !== 404) { res = r; usouPath = path; break; } // achou um endpoint que existe
    }
    if (!res) {
      return { ok: false, error: `Nenhum endpoint de cotação encontrado (todos 404). Tentativas: ${JSON.stringify(tentativas)}` };
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Brudam ${res.status} em ${usouPath}`, status: res.status, detail: json };
    const data = json?.data ?? json;
    const totalFrete = data.valorTotal ?? data.valor_frete ?? data.total ?? data.frete ?? null;
    const prazo = data.prazo ?? data.prazoEntrega ?? data.prazo_entrega ?? data.diasUteis ?? null;
    return {
      ok: true,
      data: {
        id: data.id ?? data.cotacaoId ?? data.cotacao_id,
        totalFrete: totalFrete != null ? Number(totalFrete) : undefined,
        prazo: prazo != null ? Number(prazo) : undefined,
        validade: data.validade ?? undefined,
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Brudam)" };
  }
}

export async function trackBrudam(notaFiscal: string): Promise<TrackingOutcome> {
  const c = getBrudamConfig();
  if (!isBrudamConfigured()) {
    return { ok: false, error: "Brudam não configurada (defina BRUDAM_USUARIO/BRUDAM_SENHA)." };
  }
  const auth = await getBrudamToken();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const res = await fetch(`${c.apiBaseUrl}/rastreios/${encodeURIComponent(notaFiscal)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${auth.token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Brudam rastreio ${res.status}`, status: res.status, detail: json };
    const data = json?.data ?? json;
    const ocorrencias: Array<{ data?: string; descricao?: string; local?: string }> =
      data.ocorrencias ?? data.eventos ?? data.timeline ?? [];
    return {
      ok: true,
      data: {
        shipments: [
          {
            status: data.status ?? data.situacao,
            numero: data.numero ?? notaFiscal,
            origem: data.origem,
            destino: data.destino,
            previsaoEntrega: data.previsaoEntrega ?? data.previsao_entrega ?? data.prazo,
            dataEntrega: data.dataEntrega ?? data.data_entrega,
            ultimaOcorrencia: ocorrencias[0]?.descricao,
            entregue: String(data.status ?? "").toLowerCase().includes("entregue"),
            timeline: ocorrencias.map((o) => ({ data: o.data, descricao: o.descricao, local: o.local })),
          },
        ],
        raw: json,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede (Brudam rastreio)" };
  }
}

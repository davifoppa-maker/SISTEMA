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

/**
 * Gera um token novo autenticando com usuário+senha (a Multi exige token fresco;
 * o token fixo de env serve só como fallback). Tenta os endpoints de login mais
 * comuns da Multi.
 */
async function brudamToken(): Promise<{ ok: true; token: string } | { ok: false; error: string; status?: number; detail?: unknown }> {
  const c = getBrudamConfig();
  if (!c.usuario || !c.senha) {
    if (c.token) return { ok: true, token: c.token };
    return { ok: false, error: "Brudam não configurada (defina BRUDAM_USUARIO e BRUDAM_SENHA)." };
  }
  const endpoints = ["/login", "/usuarios/autenticar", "/auth/login", "/autenticar"];
  let lastErr = "Brudam: falha ao autenticar.";
  let lastStatus: number | undefined;
  let lastDetail: unknown;
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${c.apiBaseUrl}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ usuario: c.usuario, senha: c.senha }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) { lastErr = `Brudam auth ${ep} 404`; continue; }
      if (!res.ok) { lastErr = `Brudam auth ${res.status}`; lastStatus = res.status; lastDetail = json; continue; }
      const token = json?.data?.token ?? json?.token ?? json?.access_token ?? json?.data?.access_token;
      if (token) return { ok: true, token: String(token) };
      lastErr = "Brudam: token não retornado na autenticação."; lastDetail = json;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "Erro de rede (Brudam auth)";
    }
  }
  return { ok: false, error: lastErr, status: lastStatus, detail: lastDetail };
}

export async function quoteBrudam(params: QuoteParams): Promise<QuoteOutcome> {
  const c = getBrudamConfig();
  if (!isBrudamConfigured()) {
    return { ok: false, error: "Brudam não configurada (defina BRUDAM_USUARIO/BRUDAM_SENHA)." };
  }
  const auth = await brudamToken();
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status, detail: auth.detail };

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
    const res = await fetch(`${c.apiBaseUrl}/cotacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: auth.token },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `Brudam ${res.status}`, status: res.status, detail: json };
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
  const auth = await brudamToken();
  if (!auth.ok) return { ok: false, error: auth.error, status: auth.status };

  try {
    const res = await fetch(`${c.apiBaseUrl}/rastreios/${encodeURIComponent(notaFiscal)}`, {
      headers: { Accept: "application/json", Authorization: auth.token },
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

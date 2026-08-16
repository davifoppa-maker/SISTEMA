/**
 * Helpers HTTP compartilhados das integrações de frete.
 * Aplicam as "regras de ouro" do guia de integração:
 *  - TIMEOUT explícito em todo fetch (AbortSignal.timeout) — uma transportadora
 *    lenta não pode segurar a função serverless.
 *  - Ler a resposta como TEXTO e só então JSON.parse em try/catch (metade das
 *    APIs devolve HTML de erro com Content-Type de JSON).
 *  - Normalizar CNPJ/CEP/NF para só dígitos.
 */

export const FREIGHT_TIMEOUT_MS = 20000;

export function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** fetch com timeout; devolve a Response e o corpo já lido como texto. */
export async function freightFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = FREIGHT_TIMEOUT_MS,
): Promise<{ res: Response; text: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  return { res, text };
}

/** JSON.parse tolerante — devolve null se não for JSON (em vez de lançar). */
export function parseJsonSafe<T = any>(text: string | null | undefined): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Converte "1.234,56" (formato BR) ou "1234.56" para número. */
export function parseBrNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  const s = String(v).trim();
  // Se tem vírgula, assume formato BR (ponto = milhar, vírgula = decimal).
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = parseFloat(norm.replace(/[^\d.-]/g, ""));
  return isNaN(n) ? null : n;
}

/** m³ total a partir das dimensões (em metros) × quantidade de volumes. */
export function totalM3(cubagem: { altura: number; largura: number; comprimento: number; volumes: number }[]): number {
  return (cubagem ?? []).reduce((s, d) => s + d.altura * d.largura * d.comprimento * (d.volumes || 1), 0);
}

/** Resolve o código IBGE de um município a partir do CEP (ViaCEP → OpenCEP). */
export async function cepToIbge(cep: string): Promise<string | null> {
  const c = onlyDigits(cep);
  if (c.length !== 8) return null;
  try {
    const { res, text } = await freightFetch(`https://viacep.com.br/ws/${c}/json/`, {}, 8000);
    if (res.ok) {
      const j = parseJsonSafe<{ ibge?: string }>(text);
      if (j?.ibge) return onlyDigits(j.ibge);
    }
  } catch { /* tenta a próxima base */ }
  try {
    const { res, text } = await freightFetch(`https://opencep.com/v1/${c}`, {}, 8000);
    if (res.ok) {
      const j = parseJsonSafe<{ ibge?: string }>(text);
      if (j?.ibge) return onlyDigits(j.ibge);
    }
  } catch { /* desiste */ }
  return null;
}

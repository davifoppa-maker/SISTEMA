/**
 * LENOIR TRANSPORTES — transportadora regional do sul de SC, SEM API.
 * A cotação é por TABELA (preço fixo por faixa de CEP de destino), resolvida
 * localmente — não há chamada externa. Veja `data/lenoir-tabela.ts`.
 */

import type { QuoteParams, QuoteOutcome, TrackingOutcome } from "@/lib/services/freight/types";
import { lenoirFaixaForCep } from "@/lib/services/freight/data/lenoir-tabela";

/** Sempre disponível: é uma tabela local, não depende de credenciais. */
export function isLenoirConfigured(): boolean {
  return true;
}

export async function quoteLenoir(params: QuoteParams): Promise<QuoteOutcome> {
  const faixa = lenoirFaixaForCep(params.cepDestino);
  if (!faixa) {
    return { ok: false, error: "A Lenoir não atende este CEP (transportadora regional do sul de SC)." };
  }
  // Valor fixo por cidade; peso/cubagem não influenciam (a Lenoir leva acima da
  // faixa da tabela, então não aplicamos limite de peso).
  return { ok: true, data: { totalFrete: faixa.valor, prazo: faixa.prazo } };
}

export async function trackLenoir(): Promise<TrackingOutcome> {
  return { ok: false, error: "A Lenoir não possui rastreio por API." };
}

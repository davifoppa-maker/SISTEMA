// Regras de cálculo de SLA. O início oficial do prazo de entrega é a COLETA REAL
// (data_coleta_real), NUNCA o status "enviado" do Tiny.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Adiciona dias corridos a uma data ISO e devolve ISO. */
export function addDays(fromIso: string, days: number): string {
  return new Date(new Date(fromIso).getTime() + days * MS_PER_DAY).toISOString();
}

/** Adiciona dias ÚTEIS (pula sábado e domingo) a uma data ISO e devolve ISO. */
export function addBusinessDays(fromIso: string, days: number): string {
  const d = new Date(fromIso);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay(); // 0 = domingo, 6 = sábado
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString();
}

/**
 * Calcula a data limite de entrega a partir da coleta real, em DIAS ÚTEIS.
 * Ex.: coleta na segunda + 2 dias úteis = quarta-feira.
 * @param collectedAtIso data/hora real da coleta (bipagem confirmada)
 * @param slaDays prazo da transportadora em dias úteis
 */
export function computeDeliveryDeadline(
  collectedAtIso: string,
  slaDays: number,
): string {
  return addBusinessDays(collectedAtIso, slaDays);
}

export type SlaEvaluation = "no_prazo" | "em_risco" | "atrasado" | "concluido";

/**
 * Avalia o status de SLA de uma entrega.
 * - concluido: já entregue
 * - atrasado: passou da data limite sem entrega
 * - em_risco: faltam <= riskWindowHours para o limite (alerta amarelo)
 * - no_prazo: caso contrário
 */
export function evaluateSla(params: {
  deadlineIso: string | null;
  deliveredAtIso: string | null;
  nowIso?: string;
  riskWindowHours?: number;
}): SlaEvaluation {
  const { deadlineIso, deliveredAtIso } = params;
  if (deliveredAtIso) return "concluido";
  if (!deadlineIso) return "no_prazo";

  const now = new Date(params.nowIso ?? new Date().toISOString()).getTime();
  const deadline = new Date(deadlineIso).getTime();
  const riskWindowMs = (params.riskWindowHours ?? 24) * 60 * 60 * 1000;

  if (now > deadline) return "atrasado";
  if (deadline - now <= riskWindowMs) return "em_risco";
  return "no_prazo";
}

/** Horas de atraso (>= 0). */
export function delayHours(deadlineIso: string, untilIso: string): number {
  const diff = new Date(untilIso).getTime() - new Date(deadlineIso).getTime();
  return diff <= 0 ? 0 : Math.round(diff / (60 * 60 * 1000));
}

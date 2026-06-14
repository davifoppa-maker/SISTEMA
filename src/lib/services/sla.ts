import type { DataStore, Shipment, SlaRecord } from "@/lib/types";
import { uuid } from "@/lib/utils/ids";
import {
  computeDeliveryDeadline,
  delayHours,
  evaluateSla,
} from "@/lib/utils/sla-rules";

/**
 * Inicia o SLA de coleta→entrega a partir da COLETA REAL (bipagem confirmada).
 * Este é o início OFICIAL do prazo logístico — nunca o status "enviado" do Tiny.
 * Define estimated_delivery_at no shipment e cria/atualiza o sla_record.
 */
export function startDeliverySla(
  store: DataStore,
  shipment: Shipment,
  carrierSlaDays: number,
  explicitDeadline?: string | null,
): SlaRecord {
  const collectedAt = shipment.real_collected_at;
  if (!collectedAt) {
    throw new Error("Não é possível iniciar SLA sem data de coleta real.");
  }

  // Prazo do Tiny (data prevista de entrega) tem prioridade; senão calcula pelo
  // prazo padrão da transportadora, em dias úteis, a partir da coleta.
  const deadline =
    explicitDeadline && !Number.isNaN(Date.parse(explicitDeadline))
      ? explicitDeadline
      : computeDeliveryDeadline(collectedAt, carrierSlaDays);
  shipment.estimated_delivery_at = deadline;

  let record = store.sla_records.find(
    (s) => s.shipment_id === shipment.id && s.sla_type === "coleta_entrega",
  );
  if (!record) {
    record = {
      id: uuid(),
      order_id: shipment.order_id,
      shipment_id: shipment.id,
      sla_type: "coleta_entrega",
      starts_at: collectedAt,
      deadline_at: deadline,
      completed_at: null,
      status: "no_prazo",
      delay_hours: null,
    };
    store.sla_records.push(record);
  } else {
    record.starts_at = collectedAt;
    record.deadline_at = deadline;
    record.status = "no_prazo";
  }
  return record;
}

/**
 * Reavalia todos os SLAs de entrega em aberto e atualiza status (no_prazo /
 * em_risco / atrasado / concluido). Idempotente.
 */
export function refreshSlaStatuses(store: DataStore, nowIso?: string): void {
  for (const record of store.sla_records) {
    if (record.sla_type !== "coleta_entrega") continue;
    const shipment = store.shipments.find((s) => s.id === record.shipment_id);
    const status = evaluateSla({
      deadlineIso: record.deadline_at,
      deliveredAtIso: shipment?.delivered_at ?? null,
      nowIso,
    });
    record.status = status;
    record.completed_at = shipment?.delivered_at ?? null;
    if (status === "atrasado" && record.deadline_at) {
      record.delay_hours = delayHours(record.deadline_at, nowIso ?? new Date().toISOString());
    }
  }
}

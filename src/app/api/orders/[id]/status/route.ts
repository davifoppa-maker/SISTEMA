import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { LOGISTIC_STATUS_LABELS, type LogisticStatus } from "@/lib/types";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 30;

const VALID = new Set(Object.keys(LOGISTIC_STATUS_LABELS));

/**
 * Override manual do status logístico de um pedido. Usado para corrigir pedidos
 * antigos cujo status no Tiny já avançou mas não foi re-sincronizado (ex.: mover
 * de "em processamento" direto para "em trânsito"/"entregue").
 *
 * Mantém a expedição (shipment) coerente quando ela existe: coleta real, trânsito
 * e entrega refletem no shipment para os demais painéis baterem.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: { status?: string };
  try {
    body = (await req.json()) as { status?: string };
  } catch {
    return fail("JSON inválido", 400);
  }
  const status = body.status;
  if (!status || !VALID.has(status)) {
    return fail("Status inválido", 422, { validos: [...VALID] });
  }

  const store = await loadStore();
  const order = store.orders.find((o) => o.id === params.id);
  if (!order) return fail("Pedido não encontrado", 404);

  const previous = order.logistic_status;
  const target = status as LogisticStatus;
  order.logistic_status = target;
  order.updated_at = nowIso();

  // Reflete no shipment (quando existe) para os outros painéis ficarem coerentes.
  const shipment = store.shipments.find((s) => s.order_id === order.id);
  if (shipment) {
    if (target === "entregue") {
      shipment.status = "entregue";
      if (!shipment.delivered_at) {
        // Usa a data REAL da transportadora (evento de entrega), se houver; senão agora.
        const deliveryEvent = store.carrier_tracking_events
          .filter((t) => t.shipment_id === shipment.id && /entreg/i.test(t.status))
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
        shipment.delivered_at = deliveryEvent?.occurred_at ?? nowIso();
      }
      // Marcar entregue resolve a notificação, os alertas e a pendência de
      // confirmação (Lenoir), além das ocorrências/tarefas de atraso.
      for (const a of store.alerts) {
        if (a.shipment_id === shipment.id && !a.resolved &&
            (a.type === "entrega_confirmada" || a.type === "atrasado" || a.type === "em_risco" || a.type === "sem_rastreio" || a.type === "pendencia")) {
          a.resolved = true;
        }
      }
      for (const o of store.occurrences) {
        if (o.shipment_id === shipment.id && o.type === "atraso" && o.status !== "resolvida") {
          o.status = "resolvida";
          o.resolved_at = nowIso();
        }
      }
      for (const t of store.customer_tasks) {
        if (t.order_id === order.id && t.type === "confirmar_entrega" && t.status === "pendente") {
          t.status = "concluida";
        }
      }
    } else if (target === "coletado" || target === "em_transito") {
      shipment.status = target;
      if (!shipment.real_collected_at) shipment.real_collected_at = nowIso();
    } else if (target === "aguardando_coleta") {
      shipment.status = "aguardando_coleta";
    }
    shipment.updated_at = nowIso();
  }

  store.audit_logs.push({
    id: uuid(),
    entity: "order",
    entity_id: order.id,
    action: "manual_status_override",
    detail: `${previous} → ${target}`,
    user_id: null,
    created_at: nowIso(),
  });

  await commitStore(store);
  return ok({ order_id: order.id, previous, status: target });
}

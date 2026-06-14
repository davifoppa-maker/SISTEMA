/**
 * Poll de rastreio nas transportadoras com API validada (Arlete + Jadlog).
 *
 * Para cada expedição já coletada e ainda não entregue, consulta a transportadora
 * e: grava os eventos novos no histórico, atualiza a previsão de entrega e, ao
 * detectar movimentação, avança o pedido para "em trânsito". Quando a
 * transportadora confirma a ENTREGA, NÃO dá baixa sozinho — cria um alerta de
 * "entrega_confirmada" sugerindo a baixa (o operador confirma).
 *
 * Roda dentro do cron /api/cron/sla-check. Idempotente: não duplica eventos nem
 * alertas e não exige colunas novas no banco.
 */

import type { DataStore } from "@/lib/types";
import { nowIso, uuid } from "@/lib/utils/ids";
import { getProvider, providerIdForCarrierName } from "@/lib/services/freight/registry";
import { isPickupCarrier } from "@/lib/services/tiny";

// Transportadoras cujo rastreio por API já foi validado com retorno real.
const AUTO_PROVIDERS = new Set(["arlete", "jadlog"]);

/** "DD/MM/AAAA" ou ISO → "AAAA-MM-DD" (para a previsão de entrega). */
function toIsoDate(s?: string): string | undefined {
  if (!s) return undefined;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : undefined;
}

/** Data de evento (ISO completo ou "AAAA-MM-DD HH:mm:ss") → ISO; senão undefined. */
function toIsoDateTime(s?: string): string | undefined {
  if (!s) return undefined;
  const v = s.trim().replace(" ", "T");
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v : undefined;
}

function formatBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export interface TrackingPollResult {
  checked: number;
  updated: number;
  /** Pedidos baixados como "entregue" automaticamente (gera notificação). */
  deliveriesAuto: number;
  errors: number;
}

export async function pollCarrierTracking(store: DataStore, limit = 40): Promise<TrackingPollResult> {
  const now = nowIso();
  const result: TrackingPollResult = { checked: 0, updated: 0, deliveriesAuto: 0, errors: 0 };

  const candidates = store.shipments.filter((s) => s.real_collected_at && !s.delivered_at);

  for (const shipment of candidates) {
    if (result.checked >= limit) break;

    const order = store.orders.find((o) => o.id === shipment.order_id);
    if (!order) continue;

    const carrier = store.carriers.find((c) => c.id === shipment.carrier_id);
    const carrierName = carrier?.name ?? order.carrier_name;
    if (isPickupCarrier(carrierName)) continue;

    const providerId = providerIdForCarrierName(carrierName);
    if (!providerId || !AUTO_PROVIDERS.has(providerId)) continue;
    const provider = getProvider(providerId);
    if (!provider || !provider.isConfigured()) continue;

    // Identificador de rastreio por transportadora:
    //  - Arlete (SSW): chave da NF-e (44 díg.)
    //  - Jadlog: shipmentId = código de rastreamento da expedição
    const identifier = providerId === "arlete" ? order.nf_chave : shipment.tracking_code;
    if (!identifier) continue;

    result.checked++;

    let outcome;
    try {
      outcome = await provider.track(identifier);
    } catch {
      result.errors++;
      continue;
    }
    if (!outcome.ok) {
      result.errors++;
      continue;
    }

    const ship = outcome.data.shipments[0];
    if (!ship) continue;

    let changed = false;

    // 1) Eventos novos → histórico (dedup por status + occurred_at).
    for (const ev of ship.timeline ?? []) {
      const occurredAt = toIsoDateTime(ev.data) ?? now;
      const status = ev.descricao ?? "evento";
      const exists = store.carrier_tracking_events.some(
        (t) => t.shipment_id === shipment.id && t.status === status && t.occurred_at === occurredAt,
      );
      if (!exists) {
        store.carrier_tracking_events.push({
          id: uuid(),
          shipment_id: shipment.id,
          status,
          description: ev.local ?? null,
          occurred_at: occurredAt,
          raw_payload: ev,
          created_at: now,
        });
        changed = true;
      }
    }

    // 2) Previsão de entrega da transportadora → estimated_delivery_at.
    const previsaoIso = toIsoDate(ship.previsaoEntrega);
    if (previsaoIso && shipment.estimated_delivery_at?.slice(0, 10) !== previsaoIso) {
      shipment.estimated_delivery_at = previsaoIso;
      changed = true;
    }

    // 3) Movimentou e ainda está "coletado" → "em trânsito".
    if ((ship.timeline?.length ?? 0) > 0 && order.logistic_status === "coletado") {
      order.logistic_status = "em_transito";
      order.updated_at = now;
      if (shipment.status === "coletado") shipment.status = "em_transito";
      changed = true;
    }

    // 4) Transportadora confirmou ENTREGA → baixa automática + notificação.
    if (ship.entregue) {
      const deliveredAt = toIsoDateTime(ship.dataEntrega) ?? now;

      // Baixa: marca entregue no pedido e na expedição com a data REAL.
      shipment.delivered_at = deliveredAt;
      shipment.status = "entregue";
      order.logistic_status = "entregue";
      order.updated_at = now;

      // Entrega resolve alertas/ocorrências de atraso e encerra o SLA de entrega.
      for (const a of store.alerts) {
        if (a.shipment_id === shipment.id && !a.resolved &&
            (a.type === "atrasado" || a.type === "em_risco" || a.type === "sem_rastreio")) {
          a.resolved = true;
        }
      }
      for (const o of store.occurrences) {
        if (o.shipment_id === shipment.id && o.type === "atraso" && o.status !== "resolvida") {
          o.status = "resolvida";
          o.resolved_at = now;
        }
      }
      store.sla_records = store.sla_records.filter((s) => s.shipment_id !== shipment.id);

      // Registra o evento de entrega no histórico (com a data real).
      const hasDeliveryEvent = store.carrier_tracking_events.some(
        (t) => t.shipment_id === shipment.id && /entreg/i.test(t.status) && t.occurred_at === deliveredAt,
      );
      if (!hasDeliveryEvent) {
        store.carrier_tracking_events.push({
          id: uuid(),
          shipment_id: shipment.id,
          status: ship.status ?? "ENTREGUE",
          description: "Entrega confirmada pela transportadora",
          occurred_at: deliveredAt,
          raw_payload: { entregue: true, dataEntrega: ship.dataEntrega ?? null },
          created_at: now,
        });
      }

      // NOTIFICAÇÃO (popup): fica aberta até o operador marcar como visualizada.
      store.alerts.push({
        id: uuid(),
        order_id: order.id,
        shipment_id: shipment.id,
        type: "entrega_confirmada",
        message: `Pedido #${order.order_number} entregue pela ${carrierName ?? "transportadora"} em ${formatBr(deliveredAt)}.`,
        resolved: false,
        created_at: now,
      });
      result.deliveriesAuto++;
      changed = true;
    }

    if (changed) {
      shipment.updated_at = now;
      result.updated++;
    }
  }

  return result;
}

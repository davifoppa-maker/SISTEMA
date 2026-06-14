import type { DataStore } from "@/lib/types";
import { isPickupCarrier } from "@/lib/services/tiny";

// "B2B em processamento": pedidos B2B em qualquer fase do Tiny ANTES de enviado
// (em aberto, aprovado, preparando, faturado, pronto p/ envio) — ou seja, ainda
// não embalados/coletados. Esses status do Tiny mapeiam para estes logísticos:
export const B2B_PROCESSING_STATUSES = new Set(["aguardando_separacao", "aguardando_faturamento"]);

// Dia no fuso de Brasília (a operação é no Brasil) — evita "hoje" errado por UTC.
function brDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  return brDay(iso) === brDay(new Date().toISOString());
}

/** "Hoje" no fuso de Brasília — reutilizável fora deste módulo. */
export function isTodayBr(iso: string | null): boolean {
  return isToday(iso);
}

// Público do pedido: B2B = Mercos; B2C = todo o resto (Nuvemshop, Mercado Livre,
// manual…). O dashboard é sempre filtrado por um público (padrão B2B).
export type Audience = "b2b" | "b2c";

export function orderMatchesAudience(channel: string, audience: Audience): boolean {
  return audience === "b2b" ? channel === "b2b_mercos" : channel !== "b2b_mercos";
}

export interface DashboardMetrics {
  b2bOpen: number;
  awaitingCollection: number;
  collectedToday: number;
  inTransit: number;
  noTrackingAfter: number;
  atRisk: number;
  delayed: number;
  deliveredToday: number;
  valueInTransit: number;
}

export function computeMetrics(store: DataStore, audience: Audience = "b2b"): DashboardMetrics {
  // Recorta o store pelo público escolhido.
  const audOrderIds = new Set(
    store.orders.filter((o) => orderMatchesAudience(o.channel, audience)).map((o) => o.id),
  );
  const orders = store.orders.filter((o) => audOrderIds.has(o.id));
  const shipments = store.shipments.filter((s) => audOrderIds.has(s.order_id));
  const audShipmentIds = new Set(shipments.map((s) => s.id));

  // Lotes (romaneios) coletados hoje — base da métrica "Coletados hoje".
  const todayBatchIds = new Set(
    (store.shipping_batches ?? []).filter((b) => isToday(b.collected_at)).map((b) => b.id),
  );

  // Transportadoras de "retirada no CD": não são coleta nem geram atraso.
  const pickupCarrierIds = new Set(
    store.carriers.filter((c) => isPickupCarrier(c.name)).map((c) => c.id),
  );
  const isPickupShipment = (s: { carrier_id: string | null }) =>
    s.carrier_id != null && pickupCarrierIds.has(s.carrier_id);
  const orderIsPickup = (orderId: string) => {
    const sh = shipments.find((s) => s.order_id === orderId);
    return sh ? isPickupShipment(sh) : false;
  };

  const inTransitStatuses = new Set(["coletado", "em_transito"]);

  const valueInTransit = shipments
    .filter((s) => inTransitStatuses.has(s.status) && !s.delivered_at)
    .reduce((sum, s) => {
      const order = orders.find((o) => o.id === s.order_id);
      return sum + (order?.total_value ?? 0);
    }, 0);

  return {
    // Pedidos do público em processamento (antes de enviado/coletado).
    b2bOpen: orders.filter((o) => B2B_PROCESSING_STATUSES.has(o.logistic_status)).length,
    // Expedições do público aguardando coleta (mesma régua do Checkout).
    awaitingCollection: shipments.filter((s) => s.status === "aguardando_coleta").length,
    // "Coletados hoje" = expedições em LOTES de coleta de hoje (sem retirada no CD).
    collectedToday: shipments.filter(
      (s) => s.batch_id != null && todayBatchIds.has(s.batch_id) && !isPickupShipment(s),
    ).length,
    inTransit: orders.filter((o) => o.logistic_status === "em_transito" || o.logistic_status === "coletado").length,
    noTrackingAfter: store.alerts.filter(
      (a) => a.type === "sem_rastreio" && !a.resolved && a.order_id != null && audOrderIds.has(a.order_id),
    ).length,
    atRisk: store.sla_records.filter(
      (s) => s.status === "em_risco" && s.shipment_id != null && audShipmentIds.has(s.shipment_id),
    ).length,
    delayed: orders.filter((o) => o.logistic_status === "atrasado" && !orderIsPickup(o.id)).length,
    deliveredToday: shipments.filter((s) => isToday(s.delivered_at)).length,
    valueInTransit,
  };
}

export interface CarrierRankRow {
  carrierId: string;
  name: string;
  orders: number;
  onTime: number;
  delayed: number;
  avgDays: number;
  occurrences: number;
  valueInTransit: number;
}

export function carrierRanking(store: DataStore, audience: Audience = "b2b"): CarrierRankRow[] {
  const audOrderIds = new Set(
    store.orders.filter((o) => orderMatchesAudience(o.channel, audience)).map((o) => o.id),
  );
  return store.carriers
    .map((carrier) => {
      const shipments = store.shipments.filter(
        (s) => s.carrier_id === carrier.id && audOrderIds.has(s.order_id),
      );
      const slas = store.sla_records.filter((s) =>
        shipments.some((sh) => sh.id === s.shipment_id),
      );
      // Retirada no CD não tem prazo → nunca conta como atrasada.
      const pickup = isPickupCarrier(carrier.name);
      const onTime = slas.filter((s) => s.status === "no_prazo" || s.status === "concluido").length;
      const delayed = pickup ? 0 : slas.filter((s) => s.status === "atrasado").length;
      const occurrences = pickup
        ? 0
        : store.occurrences.filter(
            (o) => o.carrier_id === carrier.id && o.order_id != null && audOrderIds.has(o.order_id),
          ).length;

      const durations = shipments
        .filter((s) => s.real_collected_at && s.delivered_at)
        .map(
          (s) =>
            (new Date(s.delivered_at!).getTime() - new Date(s.real_collected_at!).getTime()) /
            86400000,
        );
      const avgDays = durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : carrier.default_sla_days;

      const valueInTransit = shipments
        .filter((s) => !s.delivered_at && s.real_collected_at)
        .reduce((sum, s) => {
          const order = store.orders.find((o) => o.id === s.order_id);
          return sum + (order?.total_value ?? 0);
        }, 0);

      return {
        carrierId: carrier.id,
        name: carrier.name,
        orders: shipments.length,
        onTime,
        delayed,
        avgDays: Math.round(avgDays * 10) / 10,
        occurrences,
        valueInTransit,
      };
    })
    .filter((r) => r.orders > 0)
    .sort((a, b) => b.delayed - a.delayed || b.orders - a.orders);
}

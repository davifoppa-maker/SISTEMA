import { loadStore, loadStoreFor } from "@/lib/db";
import { refreshSlaStatuses } from "@/lib/services/sla";
import type { DataStore, Order, Shipment } from "@/lib/types";

// Tabelas necessárias para montar a listagem de pedidos (visão).
const ORDER_VIEW_TABLES = [
  "orders",
  "customers",
  "carriers",
  "shipments",
  "shipment_volumes",
  "sla_records",
  "invoices",
] as const;

export interface OrderView {
  order: Order;
  customerName: string;
  customerDoc: string | null;
  invoiceNumber: string | null;
  carrierName: string | null;
  shipment: Shipment | null;
  volumesExpected: number;
  volumesScanned: number;
  slaStatus: import("@/lib/types").SlaStatus | null;
  estimatedDelivery: string | null;
  collectedAt: string | null;
}

/** Lê o store mantendo SLAs atualizados (idempotente). */
export async function readStore(): Promise<DataStore> {
  const store = await loadStore();
  refreshSlaStatuses(store);
  return store;
}

export async function listOrderViews(): Promise<OrderView[]> {
  const store = await readStore();
  return ordenaPorNumero(buildAllOrderViews(store));
}

export async function buildOrderView(orderId: string): Promise<OrderView | null> {
  const store = await readStore();
  return buildOrderViewFromStore(store, orderId);
}

/** Listagem de pedidos com consulta direcionada (não carrega a base inteira). */
export async function listOrderViewsFast(): Promise<OrderView[]> {
  const store = await loadStoreFor([...ORDER_VIEW_TABLES]);
  refreshSlaStatuses(store);
  return ordenaPorNumero(buildAllOrderViews(store));
}

/** Monta a visão de um pedido a partir de um store já carregado (sem nova leitura). */
export function buildOrderViewFromStore(store: DataStore, orderId: string): OrderView | null {
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) return null;

  const customer = store.customers.find((c) => c.id === order.customer_id);
  const shipment = store.shipments.find((s) => s.order_id === order.id) ?? null;
  const invoice = store.invoices.find((i) => i.order_id === order.id) ?? null;
  const carrier = shipment?.carrier_id
    ? store.carriers.find((c) => c.id === shipment.carrier_id)
    : null;
  const volumes = shipment
    ? store.shipment_volumes.filter((v) => v.shipment_id === shipment.id)
    : [];
  const sla = shipment
    ? store.sla_records.find((s) => s.shipment_id === shipment.id && s.sla_type === "coleta_entrega")
    : null;

  return {
    order,
    customerName: customer?.name ?? "—",
    customerDoc: customer?.document ?? null,
    // Coluna NF: número da nota puxada do Tiny (fallback p/ invoice do webhook).
    invoiceNumber: order.nf_numero ?? invoice?.number ?? null,
    // Transportadora vem do pedido (payload do Tiny); fallback p/ a da expedição.
    carrierName: order.carrier_name ?? carrier?.name ?? null,
    shipment,
    volumesExpected: volumes.filter((v) => v.expected).length,
    volumesScanned: volumes.filter((v) => v.scanned).length,
    slaStatus: sla?.status ?? null,
    estimatedDelivery: shipment?.estimated_delivery_at ?? null,
    collectedAt: shipment?.real_collected_at ?? null,
  };
}

/**
 * Monta TODAS as views de uma vez, indexando as tabelas de apoio em Maps.
 * Evita o O(n²) de chamar buildOrderViewFromStore (que faz .find por pedido) —
 * principal causa de lentidão com muitos pedidos.
 */
export function buildAllOrderViews(store: DataStore): OrderView[] {
  const customerById = new Map(store.customers.map((c) => [c.id, c]));
  const carrierById = new Map(store.carriers.map((c) => [c.id, c]));
  const shipmentByOrder = new Map<string, (typeof store.shipments)[number]>();
  for (const s of store.shipments) if (!shipmentByOrder.has(s.order_id)) shipmentByOrder.set(s.order_id, s);
  const invoiceByOrder = new Map<string, (typeof store.invoices)[number]>();
  for (const i of store.invoices) if (!invoiceByOrder.has(i.order_id)) invoiceByOrder.set(i.order_id, i);
  const volumesByShipment = new Map<string, (typeof store.shipment_volumes)[number][]>();
  for (const v of store.shipment_volumes) {
    const a = volumesByShipment.get(v.shipment_id);
    if (a) a.push(v); else volumesByShipment.set(v.shipment_id, [v]);
  }
  const slaByShipment = new Map<string, (typeof store.sla_records)[number]>();
  for (const s of store.sla_records) {
    if (s.sla_type === "coleta_entrega" && !slaByShipment.has(s.shipment_id)) slaByShipment.set(s.shipment_id, s);
  }

  const views: OrderView[] = [];
  for (const order of store.orders) {
    const customer = order.customer_id ? customerById.get(order.customer_id) : undefined;
    const shipment = shipmentByOrder.get(order.id) ?? null;
    const invoice = invoiceByOrder.get(order.id) ?? null;
    const carrier = shipment?.carrier_id ? carrierById.get(shipment.carrier_id) : null;
    const volumes = shipment ? (volumesByShipment.get(shipment.id) ?? []) : [];
    const sla = shipment ? slaByShipment.get(shipment.id) ?? null : null;
    views.push({
      order,
      customerName: customer?.name ?? "—",
      customerDoc: customer?.document ?? null,
      invoiceNumber: order.nf_numero ?? invoice?.number ?? null,
      carrierName: order.carrier_name ?? carrier?.name ?? null,
      shipment,
      volumesExpected: volumes.filter((v) => v.expected).length,
      volumesScanned: volumes.filter((v) => v.scanned).length,
      slaStatus: sla?.status ?? null,
      estimatedDelivery: shipment?.estimated_delivery_at ?? null,
      collectedAt: shipment?.real_collected_at ?? null,
    });
  }
  return views;
}

function ordenaPorNumero(views: OrderView[]): OrderView[] {
  return views.sort((a, b) => {
    const na = Number(a.order.order_number);
    const nb = Number(b.order.order_number);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
    return a.order.order_number < b.order.order_number ? 1 : -1;
  });
}

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
  return store.orders
    .map((order) => buildOrderViewFromStore(store, order.id))
    .filter((v): v is OrderView => v !== null)
    .sort((a, b) => {
      // Maior número de pedido no topo (mais recente primeiro).
      const na = Number(a.order.order_number);
      const nb = Number(b.order.order_number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return a.order.order_number < b.order.order_number ? 1 : -1;
    });
}

export async function buildOrderView(orderId: string): Promise<OrderView | null> {
  const store = await readStore();
  return buildOrderViewFromStore(store, orderId);
}

/** Listagem de pedidos com consulta direcionada (não carrega a base inteira). */
export async function listOrderViewsFast(): Promise<OrderView[]> {
  const store = await loadStoreFor([...ORDER_VIEW_TABLES]);
  refreshSlaStatuses(store);
  return store.orders
    .map((order) => buildOrderViewFromStore(store, order.id))
    .filter((v): v is OrderView => v !== null)
    .sort((a, b) => {
      const na = Number(a.order.order_number);
      const nb = Number(b.order.order_number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return a.order.order_number < b.order.order_number ? 1 : -1;
    });
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

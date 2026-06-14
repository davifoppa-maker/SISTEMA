import { loadStore, loadStoreFor, commitStore } from "@/lib/db";
import { ok, fail, parseBody } from "@/lib/api";
import { finalizeCheckoutSchema } from "@/lib/validation/schemas";
import { finalizeCheckout } from "@/lib/services/automation";

export const dynamic = "force-dynamic";

// Lista expedições disponíveis para coleta ou busca por termo (pedido/NF/chave/cliente/código).
export async function GET(req: Request) {
  // Consulta direcionada (sem carregar a base inteira) → rápido e completo.
  const store = await loadStoreFor(["shipments", "carriers", "customers", "orders"]);
  const q = (new URL(req.url).searchParams.get("q") ?? "").toLowerCase();

  const results = store.shipments
    .filter((s) => s.status === "aguardando_coleta" || s.status === "coletado")
    // Checkout de Expedição é exclusivo para pedidos B2B (Mercos).
    .filter((s) => {
      const o = store.orders.find((o) => o.id === s.order_id);
      return o?.channel === "b2b_mercos";
    })
    .map((s) => {
      const order = store.orders.find((o) => o.id === s.order_id);
      const customer = order ? store.customers.find((c) => c.id === order.customer_id) : null;
      const carrier = s.carrier_id ? store.carriers.find((c) => c.id === s.carrier_id) : null;
      // Nome da transportadora: do cadastro (se resolvida) ou o nome cru do pedido.
      const carrierName = carrier?.name ?? order?.carrier_name ?? null;
      return {
        shipment_id: s.id,
        status: s.status,
        order_number: order?.order_number ?? "",
        customer_name: customer?.name ?? "",
        carrier_id: s.carrier_id,
        carrier_name: carrierName,
        nf_numero: order?.nf_numero ?? null,
        nf_chave: order?.nf_chave ?? null,
      };
    });

  const filtered = q
    ? results.filter(
        (r) =>
          r.order_number.toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q) ||
          (r.carrier_name ?? "").toLowerCase().includes(q),
      )
    : results;

  return ok(filtered);
}

// Finaliza a coleta (bipagem confirmada) → gera EXPEDICAO_COLETADA.
export async function POST(req: Request) {
  const parsed = await parseBody(req, finalizeCheckoutSchema);
  if (!parsed.ok) return parsed.response;

  const store = await loadStore();
  try {
    const { shipment } = await finalizeCheckout(store, parsed.data);
    await commitStore(store);
    return ok({
      shipment_id: shipment.id,
      status: shipment.status,
      real_collected_at: shipment.real_collected_at,
      estimated_delivery_at: shipment.estimated_delivery_at,
      tracking_code: shipment.tracking_code,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Falha ao finalizar coleta", 422);
  }
}

import { loadStoreFor } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { fetchOrderWeight } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Busca o PESO BRUTO de um pedido no Tiny, sob demanda (apenas o pedido selecionado).
// Aceita ?orderId=<uuid> ou ?number=<nº do pedido>. ?debug=1 retorna diagnóstico.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const number = url.searchParams.get("number");
  const debug = url.searchParams.get("debug") === "1";
  if (!orderId && !number) return fail("orderId ou number é obrigatório", 400);

  const store = await loadStoreFor(["orders"]);
  const order = orderId
    ? store.orders.find((o) => o.id === orderId)
    : store.orders.find((o) => o.order_number === number);
  if (!order) return fail("Pedido não encontrado", 404);
  if (!order.tiny_id) return ok({ pesoBruto: null, volumes: null, source: null });

  try {
    const weight = await fetchOrderWeight(order.tiny_id, { debug });
    return ok(weight);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Falha ao consultar o Tiny", 502);
  }
}

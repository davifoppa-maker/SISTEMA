import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { ingestOrder } from "@/lib/services/tiny";
import { fetchOrderById, isTinyConnected } from "@/lib/services/tiny-api";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 60;

// Força a ressincronização de um pedido.
//   • Com o Tiny conectado, consulta a API V3 pelo id e reingere o pedido.
//   • Sem conexão, devolve o estado atual do pedido no store (com raw_payload).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const store = await loadStore();

  if (await isTinyConnected().catch(() => false)) {
    try {
      const payload = await fetchOrderById(params.id);
      if (!payload) return fail("Pedido não encontrado no Tiny", 404);
      const order = ingestOrder(store, tinyOrderSchema.parse(payload));
      store.api_sync_logs.push({
        id: uuid(),
        source: "tiny",
        operation: "sync_order",
        ok: true,
        detail: `pedido ${order.order_number}`,
        created_at: nowIso(),
      });
      await commitStore(store);
      return ok({ order, raw_payload: order.raw_payload });
    } catch (err) {
      return fail("Falha ao buscar pedido no Tiny", 502, err instanceof Error ? err.message : err);
    }
  }

  const order =
    store.orders.find((o) => o.id === params.id) ??
    store.orders.find((o) => o.order_number === params.id) ??
    store.orders.find((o) => o.tiny_id === params.id);
  if (!order) return fail("Pedido não encontrado", 404);
  return ok({ order, raw_payload: order.raw_payload });
}

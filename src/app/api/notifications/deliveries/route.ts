import { loadStore, loadStoreFor, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET — notificações de entrega (baixa automática) ainda não visualizadas.
export async function GET() {
  const store = await loadStoreFor(["alerts"]);
  const items = store.alerts
    .filter((a) => a.type === "entrega_confirmada" && !a.resolved)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((a) => ({ id: a.id, order_id: a.order_id, message: a.message, created_at: a.created_at }));
  return ok({ items });
}

// POST — marca notificações como visualizadas (resolve). Sem ids → todas.
export async function POST(req: Request) {
  let ids: string[] | undefined;
  try {
    const body = (await req.json()) as { ids?: string[] };
    ids = Array.isArray(body?.ids) ? body.ids : undefined;
  } catch {
    /* corpo vazio = todas */
  }
  const store = await loadStore();
  let acked = 0;
  for (const a of store.alerts) {
    if (a.type === "entrega_confirmada" && !a.resolved && (!ids || ids.includes(a.id))) {
      a.resolved = true;
      acked++;
    }
  }
  await commitStore(store);
  return ok({ acked });
}

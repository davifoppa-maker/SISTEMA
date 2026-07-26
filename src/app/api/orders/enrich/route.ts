import { ok, fail } from "@/lib/api";
import { loadStoreFor, commitStore } from "@/lib/db";
import { enrichOrderItems } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Preenche os itens dos pedidos que ainda não têm (buscando do Tiny). Chamado em
// SEGUNDO PLANO pela tela de Margem de Pedidos — não bloqueia o carregamento.
//   POST /api/orders/enrich?cap=20
export async function POST(req: Request) {
  const cap = Math.min(Math.max(Number(new URL(req.url).searchParams.get("cap")) || 20, 1), 40);
  try {
    const store = await loadStoreFor(["orders", "order_items"] as Array<keyof DataStore>);
    const n = await enrichOrderItems(store, cap);
    if (n > 0) await commitStore(store);
    return ok({ enriched: n });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "erro", 500);
  }
}

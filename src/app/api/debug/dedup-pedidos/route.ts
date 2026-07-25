import { ok, fail } from "@/lib/api";
import { loadStoreFor, commitStore } from "@/lib/db";
import { dedupOrders } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLES: Array<keyof DataStore> = [
  "orders", "order_items", "invoices", "shipments", "shipment_volumes", "sla_records",
];

// Remove pedidos DUPLICADOS (mesmo número+empresa). Mantém 1 por grupo.
//   GET /api/debug/dedup-pedidos?k=exxdebug          (dry-run)
//   GET /api/debug/dedup-pedidos?k=exxdebug&apply=1  (apaga)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const apply = url.searchParams.get("apply") === "1";

  const store = await loadStoreFor(TABLES);
  const r = dedupOrders(store);
  if (apply && r.removed > 0) await commitStore(store);

  return ok({
    modo: apply ? "APLICADO" : "dry-run (nada apagado — use &apply=1)",
    grupos_duplicados: r.grupos,
    pedidos_removidos: apply ? r.removed : 0,
    seriam_removidos: r.removed,
    detalhe: r.detalhe.slice(0, 100),
  });
}

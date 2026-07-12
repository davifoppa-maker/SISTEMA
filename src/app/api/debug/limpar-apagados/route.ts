import { ok, fail } from "@/lib/api";
import { loadStoreFor, commitStore } from "@/lib/db";
import { removeDeletedOlistOrders } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remove do nosso banco os pedidos apagados no Olist (404 confirmado).
//   GET /api/debug/limpar-apagados?k=exxdebug&cap=12
const TABLES: Array<keyof DataStore> = [
  "orders", "order_items", "invoices", "shipments", "shipment_volumes",
  "sla_records", "customers", "carriers", "api_sync_logs",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const cap = Math.min(Math.max(Number(url.searchParams.get("cap")) || 12, 1), 40);

  const store = await loadStoreFor(TABLES);
  const r = await removeDeletedOlistOrders(store, cap);
  if (r.removed > 0) await commitStore(store);
  return ok(r);
}

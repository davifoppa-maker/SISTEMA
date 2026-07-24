import { ok, fail } from "@/lib/api";
import { loadStoreFor, commitStore } from "@/lib/db";
import { removeDeletedOlistOrders } from "@/lib/services/tiny";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remove do nosso banco os pedidos apagados no Olist (404 confirmado).
//   GET /api/debug/limpar-apagados?k=exxdebug&cap=40
//   ...&numeros=708,203     → checa SÓ esses pedidos (o que você apagou)
//   ...&recentes=1&cap=80   → checa os pedidos mais RECENTES (apaguei agora)
const TABLES: Array<keyof DataStore> = [
  "orders", "order_items", "invoices", "shipments", "shipment_volumes",
  "sla_records", "customers", "carriers", "api_sync_logs",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const cap = Math.min(Math.max(Number(url.searchParams.get("cap")) || 40, 1), 200);
  const numeros = (url.searchParams.get("numeros") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const recentes = url.searchParams.get("recentes") === "1";

  const store = await loadStoreFor(TABLES);
  const filter = numeros.length > 0
    ? (o: (typeof store.orders)[number]) => numeros.includes(o.order_number)
    : undefined;
  const r = await removeDeletedOlistOrders(store, {
    cap: numeros.length > 0 ? numeros.length : cap,
    filter,
    ordenar: recentes ? "recentes" : "antigos",
  });
  if (r.removed > 0) await commitStore(store);
  return ok(r);
}

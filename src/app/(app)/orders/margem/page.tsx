import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { MargemPedidosClient } from "./margem-pedidos-client";

export const dynamic = "force-dynamic";

export default async function OrdemMargemPage() {
  const [views, CATALOG] = await Promise.all([listOrderViewsFast(), getCatalog()]);

  const sb = getSupabaseAdmin();
  const { data: allItems } = await sb
    .from("order_items")
    .select("order_id, sku, quantity, unit_value");

  const itemsByOrder = new Map<string, { sku: string | null; quantity: number; unit_value: number }[]>();
  for (const item of allItems ?? []) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push({ sku: item.sku, quantity: item.quantity, unit_value: item.unit_value ?? 0 });
    itemsByOrder.set(item.order_id, arr);
  }

  const orders = views.map((v) => ({
    id: v.order.id,
    order_number: v.order.order_number,
    tiny_status: v.order.tiny_status,
    customerName: v.customerName,
    items: (itemsByOrder.get(v.order.id) ?? []).map((i) => {
      const catalogProduct = CATALOG.find((p) => p.sku === i.sku);
      return {
        sku: i.sku,
        quantity: i.quantity,
        unit_value: i.unit_value,
        catalog_cost: catalogProduct?.cost ?? null,
        name: catalogProduct?.name ?? i.sku ?? "Produto desconhecido",
      };
    }),
  }));

  return <MargemPedidosClient orders={orders} />;
}

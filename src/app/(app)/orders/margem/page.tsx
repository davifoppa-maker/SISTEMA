import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { ehCancelado, clienteIgnorado, pedidoNumIgnorado, clienteForaDaMargem } from "@/lib/pedido";
import { buildSellerCanonicalizer } from "@/lib/seller";
import { MargemPedidosClient } from "./margem-pedidos-client";

export const dynamic = "force-dynamic";

export default async function OrdemMargemPage() {
  const [views, CATALOG] = await Promise.all([listOrderViewsFast(), getCatalog()]);

  const sb = getSupabaseAdmin();
  // Pagina TODOS os itens (o Supabase corta em 1000 por consulta).
  const allItems: { order_id: string; sku: string | null; quantity: number; unit_value: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("order_items")
      .select("order_id, sku, quantity, unit_value")
      .order("order_id", { ascending: true })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    allItems.push(...(data as any[]));
    if (data.length < 1000) break;
  }

  const itemsByOrder = new Map<string, { sku: string | null; quantity: number; unit_value: number }[]>();
  for (const item of allItems ?? []) {
    const arr = itemsByOrder.get(item.order_id) ?? [];
    arr.push({ sku: item.sku, quantity: item.quantity, unit_value: item.unit_value ?? 0 });
    itemsByOrder.set(item.order_id, arr);
  }

  const sellerOf = buildSellerCanonicalizer(views.map((v) => v.order.seller));

  const orders = views
    .filter((v) => !ehCancelado(v.order.tiny_status)) // pedido cancelado não conta
    .filter((v) => !clienteIgnorado(v.customerName)) // cliente interno (ex.: Exx Nutrition)
    .filter((v) => !pedidoNumIgnorado(v.order.order_number)) // pedido excluído manualmente
    .filter((v) => !clienteForaDaMargem(v.customerName)) // Exx: fora da margem (custo distorcido)
    .map((v) => ({
    id: v.order.id,
    order_number: v.order.order_number,
    tiny_status: v.order.tiny_status,
    order_date: v.order.order_date ?? null,
    empresa: (v.order as any).empresa ?? "nyer",
    customerName: v.customerName,
    vendedor: sellerOf(v.order.seller),
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

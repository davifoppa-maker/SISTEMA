import { ok, fail } from "@/lib/api";
import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Valida a QUALIDADE dos dados que alimentam o Dashboard Comercial.
// ?de=YYYY-MM-DD&ate=YYYY-MM-DD (padrão: últimos 90 dias)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const de = url.searchParams.get("de") || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const ate = url.searchParams.get("ate") || new Date().toISOString().slice(0, 10);

  const [views, catalog] = await Promise.all([listOrderViewsFast(), getCatalog()]);
  const custoDe = new Map(catalog.map((p) => [p.sku, p.cost]));

  const sb = getSupabaseAdmin();
  const allItems: { order_id: string; sku: string | null; quantity: number; unit_value: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("order_items").select("order_id, sku, quantity, unit_value").order("order_id", { ascending: true }).range(from, from + 999);
    if (!data || data.length === 0) break;
    allItems.push(...(data as any[]));
    if (data.length < 1000) break;
  }
  const itemsByOrder = new Map<string, typeof allItems>();
  for (const it of allItems) { const a = itemsByOrder.get(it.order_id) ?? []; a.push(it); itemsByOrder.set(it.order_id, a); }

  const noPeriodo = views.filter((v) => { const d = (v.order.order_date ?? "").slice(0, 10); return d >= de && d <= ate; });

  let semVendedor = 0, semData = 0, semItens = 0, receitaViaTotalValue = 0, semCliente = 0;
  const skusSemCusto = new Map<string, { nome: string; receita: number }>();
  const vendedoresSet = new Set<string>();

  for (const v of noPeriodo) {
    if (!v.order.seller) semVendedor++; else vendedoresSet.add(v.order.seller);
    if (!v.order.order_date) semData++;
    if (!v.order.customer_id) semCliente++;
    const its = itemsByOrder.get(v.order.id) ?? [];
    if (its.length === 0) { semItens++; if ((v.order.total_value ?? 0) > 0) receitaViaTotalValue++; }
    for (const i of its) {
      const custo = custoDe.get(i.sku ?? "");
      if (custo == null || custo === 0) {
        const key = i.sku ?? "—";
        const e = skusSemCusto.get(key) ?? { nome: catalog.find((p) => p.sku === i.sku)?.name ?? (i.sku ?? "?"), receita: 0 };
        e.receita += (i.unit_value ?? 0) * i.quantity;
        skusSemCusto.set(key, e);
      }
    }
  }

  const totalOrdersSemData = views.filter((v) => !v.order.order_date).length;

  return ok({
    periodo: { de, ate },
    pedidos_no_periodo: noPeriodo.length,
    total_pedidos_base: views.length,
    qualidade: {
      pedidos_SEM_vendedor: semVendedor,
      pedidos_SEM_data_no_periodo: semData,
      pedidos_SEM_cliente: semCliente,
      pedidos_SEM_itens: semItens,
      "pedidos_sem_itens_mas_com_total>0": receitaViaTotalValue,
      vendedores_distintos: vendedoresSet.size,
      "TOTAL_pedidos_sem_data (fora do período por isso)": totalOrdersSemData,
    },
    // Produtos vendidos SEM custo cadastrado → inflam a margem (aparecem como 100%).
    produtos_sem_custo: [...skusSemCusto.entries()]
      .map(([sku, e]) => ({ sku, nome: e.nome, receita: Math.round(e.receita) }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 30),
    vendedores: [...vendedoresSet].sort(),
  });
}

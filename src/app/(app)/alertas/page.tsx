import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { AlertasClient, type AlertaPedido } from "./alertas-client";

export const dynamic = "force-dynamic";

// Margem mínima esperada por pedido (%). Abaixo disso = alerta comercial.
const MARGEM_ALVO = 26;

export default async function AlertasPage() {
  const [views, catalog] = await Promise.all([listOrderViewsFast(), getCatalog()]);

  const sb = getSupabaseAdmin();
  // Pagina TODOS os itens (Supabase corta em 1000 por consulta).
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

  const custoDe = (sku: string | null) => catalog.find((p) => p.sku === sku)?.cost ?? null;
  const nomeDe = (sku: string | null) => catalog.find((p) => p.sku === sku)?.name ?? sku ?? "Produto";

  const alertas: AlertaPedido[] = [];
  for (const v of views) {
    const its = itemsByOrder.get(v.order.id) ?? [];
    if (its.length === 0) continue; // sem itens → sem como avaliar margem
    let receita = 0;
    let custo = 0;
    let temCusto = false;
    const itensRuins: { nome: string; margem: number }[] = [];
    for (const i of its) {
      if (i.unit_value <= 0) continue; // bonificado: fora da margem
      const c = custoDe(i.sku);
      const total = i.unit_value * i.quantity;
      receita += total;
      if (c != null) {
        temCusto = true;
        custo += c * i.quantity;
        const mItem = i.unit_value > 0 ? ((i.unit_value - c) / i.unit_value) * 100 : 0;
        if (mItem < MARGEM_ALVO) itensRuins.push({ nome: nomeDe(i.sku), margem: Math.round(mItem) });
      }
    }
    if (!temCusto || receita <= 0) continue;
    const margem = ((receita - custo) / receita) * 100;
    if (margem < MARGEM_ALVO) {
      alertas.push({
        id: v.order.id,
        numero: v.order.order_number,
        cliente: v.customerName,
        empresa: (v.order as any).empresa ?? "nyer",
        status: v.order.tiny_status ?? "—",
        receita,
        margem: Math.round(margem * 10) / 10,
        prejuizo: margem < 0,
        itensRuins,
      });
    }
  }
  // Piores margens primeiro.
  alertas.sort((a, b) => a.margem - b.margem);

  return <AlertasClient alertas={alertas} margemAlvo={MARGEM_ALVO} />;
}

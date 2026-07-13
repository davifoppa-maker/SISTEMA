import { ok, fail } from "@/lib/api";
import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { buildSellerCanonicalizer, normSeller } from "@/lib/seller";
import { ehCancelado, clienteIgnorado } from "@/lib/pedido";

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

  // Diagnóstico de VENDEDOR: nomes brutos distintos x nomes unificados, e
  // quanto do faturamento vem do fallback total_value (pedidos sem itens).
  const sellerOf = buildSellerCanonicalizer(views.map((v) => v.order.seller));
  const brutosDistintos = new Set<string>();
  const canonDistintos = new Set<string>();
  const mudancas = new Map<string, string>(); // bruto -> canônico (só quando muda)
  const porVendedorDbg = new Map<string, { pedidos: number; faturamento: number; fatViaFallback: number }>();
  let fatItens = 0, fatFallback = 0;
  for (const v of noPeriodo) {
    const bruto = normSeller(v.order.seller);
    const canon = sellerOf(v.order.seller);
    brutosDistintos.add(bruto);
    canonDistintos.add(canon);
    if (bruto !== canon) mudancas.set(bruto, canon);

    const its = itemsByOrder.get(v.order.id) ?? [];
    let receita = 0;
    for (const i of its) receita += (i.unit_value ?? 0) * i.quantity;
    let viaFallback = 0;
    if (receita === 0) { receita = v.order.total_value ?? 0; viaFallback = receita; fatFallback += receita; }
    else fatItens += receita;

    const a = porVendedorDbg.get(canon) ?? { pedidos: 0, faturamento: 0, fatViaFallback: 0 };
    a.pedidos++; a.faturamento += receita; a.fatViaFallback += viaFallback;
    porVendedorDbg.set(canon, a);
  }

  // MAIORES pedidos do período — quebra por receita de itens x fallback (s/ frete),
  // frete, custo e margem. Serve para achar o pedido que distorce o dashboard.
  const detalhe = noPeriodo.map((v) => {
    const its = itemsByOrder.get(v.order.id) ?? [];
    let recItens = 0, custo = 0;
    for (const i of its) {
      const val = i.unit_value ?? 0;
      if (val <= 0) continue;
      recItens += val * i.quantity;
      custo += (custoDe.get(i.sku ?? "") ?? 0) * i.quantity;
    }
    const frete = v.order.freight_value ?? 0;
    const totalPedido = v.order.total_value ?? 0;
    const receita = totalPedido > 0 ? totalPedido : recItens; // base = total do pedido (Olist)
    return {
      numero: v.order.order_number,
      cliente: v.customerName,
      vendedor: sellerOf(v.order.seller),
      data: (v.order.order_date ?? "").slice(0, 10),
      receita: Math.round(receita),
      receitaItens: Math.round(recItens),
      via: totalPedido > 0 ? "total_pedido" : "itens",
      frete: Math.round(frete),
      custo: Math.round(custo),
      margemPct: receita > 0 ? Math.round(((receita - custo) / receita) * 100) : 0,
      cancelado: ehCancelado(v.order.tiny_status),
      clienteIgnorado: clienteIgnorado(v.customerName),
    };
  }).sort((a, b) => b.receita - a.receita).slice(0, 20);

  return ok({
    periodo: { de, ate },
    pedidos_no_periodo: noPeriodo.length,
    maiores_pedidos: detalhe,
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
    vendedor_diagnostico: {
      nomes_brutos_distintos: brutosDistintos.size,
      nomes_unificados_distintos: canonDistintos.size,
      unificacoes: [...mudancas.entries()].map(([de, para]) => ({ de, para })),
      faturamento_via_itens: Math.round(fatItens),
      faturamento_via_fallback_total_value: Math.round(fatFallback),
      por_vendedor: [...porVendedorDbg.entries()]
        .map(([nome, a]) => ({ nome, pedidos: a.pedidos, faturamento: Math.round(a.faturamento), fatViaFallback: Math.round(a.fatViaFallback) }))
        .sort((x, y) => y.faturamento - x.faturamento),
    },
  });
}

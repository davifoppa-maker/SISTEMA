import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { ComercialClient, type DadosComercial } from "./comercial-client";

export const dynamic = "force-dynamic";

function isoDaysAgo(d: number) {
  const dt = new Date(Date.now() - d * 86400000);
  return dt.toISOString().slice(0, 10);
}

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string };
}) {
  const de = searchParams.de || isoDaysAgo(90);
  const ate = searchParams.ate || isoDaysAgo(0);

  const [views, catalog] = await Promise.all([listOrderViewsFast(), getCatalog()]);
  const custoDe = new Map(catalog.map((p) => [p.sku, p.cost]));

  // Itens (paginados — Supabase corta em 1000).
  const sb = getSupabaseAdmin();
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
  const itemsByOrder = new Map<string, typeof allItems>();
  for (const it of allItems) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  const dentroPeriodo = (d: string | null) => {
    const dia = (d ?? "").slice(0, 10);
    if (!dia) return false;
    return dia >= de && dia <= ate;
  };

  // Carteira total = todos os clientes que já compraram (qualquer data).
  const carteiraGlobal = new Set<string>();
  const carteiraPorVendedor = new Map<string, Set<string>>();
  for (const v of views) {
    if (v.order.customer_id) {
      carteiraGlobal.add(v.order.customer_id);
      const sel = v.order.seller ?? "Sem vendedor";
      if (!carteiraPorVendedor.has(sel)) carteiraPorVendedor.set(sel, new Set());
      carteiraPorVendedor.get(sel)!.add(v.order.customer_id);
    }
  }

  interface Agg { faturamento: number; custo: number; pedidos: number; clientes: Set<string>; }
  const porVendedor = new Map<string, Agg>();
  const abcMap = new Map<string, { nome: string; receita: number }>();
  const positivadosGlobal = new Set<string>();
  let fatTotal = 0, custoTotal = 0, pedidosTotal = 0;

  for (const v of views) {
    if (!dentroPeriodo(v.order.order_date)) continue;
    const its = itemsByOrder.get(v.order.id) ?? [];
    let receita = 0, custo = 0;
    for (const i of its) {
      const tot = (i.unit_value ?? 0) * i.quantity;
      receita += tot;
      custo += (custoDe.get(i.sku ?? "") ?? 0) * i.quantity;
      // ABC por produto (receita).
      const key = i.sku ?? "—";
      const e = abcMap.get(key) ?? { nome: catalog.find((p) => p.sku === i.sku)?.name ?? (i.sku ?? "Produto"), receita: 0 };
      e.receita += tot;
      abcMap.set(key, e);
    }
    // Se o pedido não tem itens mapeados, usa o total_value como receita.
    if (receita === 0) receita = v.order.total_value ?? 0;

    const sel = v.order.seller ?? "Sem vendedor";
    const a = porVendedor.get(sel) ?? { faturamento: 0, custo: 0, pedidos: 0, clientes: new Set() };
    a.faturamento += receita;
    a.custo += custo;
    a.pedidos += 1;
    if (v.order.customer_id) a.clientes.add(v.order.customer_id);
    porVendedor.set(sel, a);

    fatTotal += receita; custoTotal += custo; pedidosTotal += 1;
    if (v.order.customer_id) positivadosGlobal.add(v.order.customer_id);
  }

  const vendedores = [...porVendedor.entries()]
    .map(([nome, a]) => {
      const carteira = carteiraPorVendedor.get(nome)?.size ?? a.clientes.size;
      return {
        nome,
        faturamento: a.faturamento,
        pedidos: a.pedidos,
        ticketMedio: a.pedidos > 0 ? a.faturamento / a.pedidos : 0,
        margem: a.faturamento > 0 ? ((a.faturamento - a.custo) / a.faturamento) * 100 : 0,
        clientesPositivados: a.clientes.size,
        carteira,
        positivacao: carteira > 0 ? (a.clientes.size / carteira) * 100 : 0,
      };
    })
    .sort((x, y) => y.faturamento - x.faturamento);

  // Curva ABC (produtos): acumula receita e classifica A(≤80%) B(≤95%) C(resto).
  const abcOrden = [...abcMap.values()].sort((a, b) => b.receita - a.receita);
  const totalAbc = abcOrden.reduce((s, p) => s + p.receita, 0) || 1;
  let acum = 0;
  const abc = abcOrden.map((p) => {
    acum += p.receita;
    const pctAcum = (acum / totalAbc) * 100;
    const classe = pctAcum <= 80 ? "A" : pctAcum <= 95 ? "B" : "C";
    return { nome: p.nome, receita: p.receita, pctAcum, classe };
  });

  const dados: DadosComercial = {
    de, ate,
    kpis: {
      faturamento: fatTotal,
      pedidos: pedidosTotal,
      ticketMedio: pedidosTotal > 0 ? fatTotal / pedidosTotal : 0,
      margem: fatTotal > 0 ? ((fatTotal - custoTotal) / fatTotal) * 100 : 0,
      positivacao: carteiraGlobal.size > 0 ? (positivadosGlobal.size / carteiraGlobal.size) * 100 : 0,
      clientesPositivados: positivadosGlobal.size,
      carteiraTotal: carteiraGlobal.size,
    },
    vendedores,
    abc: abc.slice(0, 40),
  };

  return <ComercialClient dados={dados} />;
}

import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { buildSellerCanonicalizer } from "@/lib/seller";
import { ehCancelado, clienteIgnorado, pedidoNumIgnorado, clienteForaDaMargem } from "@/lib/pedido";
import { ComercialClient, type DadosComercial } from "./comercial-client";

export const dynamic = "force-dynamic";

function isoDaysAgo(d: number) {
  const dt = new Date(Date.now() - d * 86400000);
  return dt.toISOString().slice(0, 10);
}

// 1º dia do mês atual (YYYY-MM-01).
function isoInicioDoMes() {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function ComercialPage({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string };
}) {
  // Padrão: mês atual (1º dia → hoje).
  const de = searchParams.de || isoInicioDoMes();
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

  // Canonicaliza o nome do vendedor (junta variações/nome parcial x completo).
  const sellerOf = buildSellerCanonicalizer(views.map((v) => v.order.seller));

  // Faturamento = VALOR TOTAL do pedido (igual ao Olist). Só cai para a soma dos
  // itens quando o pedido não tem total_value. Pedido zerado retorna 0 e é ignorado.
  const receitaDeVenda = (o: { id: string; total_value: number | null }): number => {
    const tv = o.total_value ?? 0;
    if (tv > 0) return tv;
    const its = itemsByOrder.get(o.id) ?? [];
    let r = 0;
    for (const i of its) { const val = i.unit_value ?? 0; if (val > 0) r += val * i.quantity; }
    return r > 0 ? r : 0;
  };
  const pedidoEhVenda = (v: (typeof views)[number]) =>
    !ehCancelado(v.order.tiny_status) && !clienteIgnorado(v.customerName) &&
    !pedidoNumIgnorado(v.order.order_number) && receitaDeVenda(v.order) > 0;

  // Carteira = clientes que já compraram (venda real; pedido zerado não conta).
  const carteiraGlobal = new Set<string>();
  const carteiraPorVendedor = new Map<string, Set<string>>();
  for (const v of views) {
    if (v.order.customer_id && pedidoEhVenda(v)) {
      carteiraGlobal.add(v.order.customer_id);
      const sel = sellerOf(v.order.seller);
      if (!carteiraPorVendedor.has(sel)) carteiraPorVendedor.set(sel, new Set());
      carteiraPorVendedor.get(sel)!.add(v.order.customer_id);
    }
  }

  // fatMargem/custo: base do cálculo de margem (exclui clientes fora da margem,
  // ex.: Exx). faturamento: total cheio (inclui Exx), para bater com o Olist.
  interface Agg { faturamento: number; fatMargem: number; custo: number; pedidos: number; clientes: Set<string>; clientesNovos: number; primeirasVendas: number; }
  const novaAgg = (): Agg => ({ faturamento: 0, fatMargem: 0, custo: 0, pedidos: 0, clientes: new Set(), clientesNovos: 0, primeirasVendas: 0 });
  const porVendedor = new Map<string, Agg>();
  const abcMap = new Map<string, { nome: string; receita: number }>();
  const positivadosGlobal = new Set<string>();
  let fatTotal = 0, fatMargemTotal = 0, custoTotal = 0, pedidosTotal = 0;

  for (const v of views) {
    if (!dentroPeriodo(v.order.order_date)) continue;
    if (ehCancelado(v.order.tiny_status)) continue; // pedido cancelado não conta
    if (clienteIgnorado(v.customerName)) continue; // cliente interno (ex.: Exx Nutrition)
    if (pedidoNumIgnorado(v.order.order_number)) continue; // pedido excluído manualmente
    const its = itemsByOrder.get(v.order.id) ?? [];
    let custo = 0, recItens = 0;
    for (const i of its) {
      const val = i.unit_value ?? 0;
      if (val <= 0) continue; // item bonificado (valor 0) NÃO entra na margem
      const tot = val * i.quantity;
      recItens += tot;
      custo += (custoDe.get(i.sku ?? "") ?? 0) * i.quantity;
      // ABC por produto (receita dos itens).
      const key = i.sku ?? "—";
      const e = abcMap.get(key) ?? { nome: catalog.find((p) => p.sku === i.sku)?.name ?? (i.sku ?? "Produto"), receita: 0 };
      e.receita += tot;
      abcMap.set(key, e);
    }
    // Faturamento = valor total do pedido (igual ao Olist); fallback: soma dos itens.
    // Pedido zerado/bonificado (total 0 e sem itens pagos) é desconsiderado.
    const receita = (v.order.total_value ?? 0) > 0 ? (v.order.total_value as number) : recItens;
    if (receita <= 0) continue;

    // Exx (e afins): conta no faturamento, mas fora do cálculo de margem.
    const foraMargem = clienteForaDaMargem(v.customerName);

    const sel = sellerOf(v.order.seller);
    const a = porVendedor.get(sel) ?? novaAgg();
    a.faturamento += receita;
    a.pedidos += 1;
    if (!foraMargem) { a.fatMargem += receita; a.custo += custo; }
    if (v.order.customer_id) a.clientes.add(v.order.customer_id);
    porVendedor.set(sel, a);

    fatTotal += receita; pedidosTotal += 1;
    if (!foraMargem) { fatMargemTotal += receita; custoTotal += custo; }
    if (v.order.customer_id) positivadosGlobal.add(v.order.customer_id);
  }

  // 1ª compra de cada cliente (TODOS os tempos, só venda real). Quando essa 1ª
  // compra cai no período, o cliente é "novo" e o crédito vai pro vendedor dela.
  const anoOk = (d: string) => { const a = Number(d.slice(0, 4)); return a >= 2015 && a <= 2030; };
  const primeiraCompra = new Map<string, { date: string; sel: string; receita: number }>();
  for (const v of views) {
    const cid = v.order.customer_id;
    if (!cid || !pedidoEhVenda(v)) continue;
    const dia = (v.order.order_date ?? "").slice(0, 10);
    if (dia.length !== 10 || !anoOk(dia)) continue;
    const prev = primeiraCompra.get(cid);
    if (!prev || dia < prev.date) {
      primeiraCompra.set(cid, { date: dia, sel: sellerOf(v.order.seller), receita: receitaDeVenda(v.order) });
    }
  }
  let clientesNovosTotal = 0, primeirasVendasTotal = 0;
  for (const pc of primeiraCompra.values()) {
    if (pc.date < de || pc.date > ate) continue;
    const a = porVendedor.get(pc.sel) ?? novaAgg();
    a.clientesNovos += 1;
    a.primeirasVendas += pc.receita;
    porVendedor.set(pc.sel, a);
    clientesNovosTotal += 1;
    primeirasVendasTotal += pc.receita;
  }

  const vendedores = [...porVendedor.entries()]
    .filter(([, a]) => a.faturamento > 0) // ignora vendedores com venda zerada
    .map(([nome, a]) => {
      const carteira = carteiraPorVendedor.get(nome)?.size ?? a.clientes.size;
      return {
        nome,
        faturamento: a.faturamento,
        pedidos: a.pedidos,
        ticketMedio: a.pedidos > 0 ? a.faturamento / a.pedidos : 0,
        margem: a.fatMargem > 0 ? ((a.fatMargem - a.custo) / a.fatMargem) * 100 : 0,
        clientesPositivados: a.clientes.size,
        carteira,
        positivacao: carteira > 0 ? (a.clientes.size / carteira) * 100 : 0,
        clientesNovos: a.clientesNovos,
        primeirasVendas: a.primeirasVendas,
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

  // POSITIVAÇÃO (independe do período): última compra de cada cliente em TODOS os
  // tempos. Clientes inativos (não recompram há X dias) entram na lista de positivar.
  interface CliAgg { nome: string; ultima: string; sel: string; pedidos: number; total: number; }
  const porCliente = new Map<string, CliAgg>();
  for (const v of views) {
    const cid = v.order.customer_id;
    if (!cid || !pedidoEhVenda(v)) continue;
    const dia = (v.order.order_date ?? "").slice(0, 10);
    if (dia.length !== 10 || !anoOk(dia)) continue;
    const receita = receitaDeVenda(v.order);
    const cur = porCliente.get(cid);
    if (!cur) porCliente.set(cid, { nome: v.customerName, ultima: dia, sel: sellerOf(v.order.seller), pedidos: 1, total: receita });
    else {
      cur.pedidos += 1;
      cur.total += receita;
      if (dia > cur.ultima) { cur.ultima = dia; cur.sel = sellerOf(v.order.seller); cur.nome = v.customerName; }
    }
  }
  const hojeIso = isoDaysAgo(0);
  const hojeMs = Date.parse(hojeIso);
  const positivar = [...porCliente.values()]
    .map((c) => ({
      cliente: c.nome,
      vendedor: c.sel,
      ultimaCompra: c.ultima,
      diasSemComprar: Math.max(0, Math.floor((hojeMs - Date.parse(c.ultima)) / 86400000)),
      pedidos: c.pedidos,
      faturamentoTotal: c.total,
    }))
    .filter((c) => c.diasSemComprar >= 30) // só quem já passou do ponto de recompra
    .sort((a, b) => b.diasSemComprar - a.diasSemComprar)
    .slice(0, 500);

  const dados: DadosComercial = {
    de, ate,
    kpis: {
      faturamento: fatTotal,
      pedidos: pedidosTotal,
      ticketMedio: pedidosTotal > 0 ? fatTotal / pedidosTotal : 0,
      margem: fatMargemTotal > 0 ? ((fatMargemTotal - custoTotal) / fatMargemTotal) * 100 : 0,
      positivacao: carteiraGlobal.size > 0 ? (positivadosGlobal.size / carteiraGlobal.size) * 100 : 0,
      clientesPositivados: positivadosGlobal.size,
      carteiraTotal: carteiraGlobal.size,
      clientesNovos: clientesNovosTotal,
      primeirasVendas: primeirasVendasTotal,
    },
    vendedores,
    abc: abc.slice(0, 40),
    positivar,
  };

  return <ComercialClient dados={dados} />;
}

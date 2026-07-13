import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getCatalog } from "@/lib/catalog";
import { buildSellerCanonicalizer } from "@/lib/seller";
import { ehCancelado, clienteIgnorado, pedidoNumIgnorado } from "@/lib/pedido";
import { BonificadosClient, type DadosBonificados, type LinhaBonificada } from "./bonificados-client";

export const dynamic = "force-dynamic";

export default async function BonificadosPage({
  searchParams,
}: {
  searchParams: { mes?: string; uf?: string };
}) {
  const mesFiltro = searchParams.mes || ""; // "YYYY-MM" ou "" (todos)
  const ufFiltro = (searchParams.uf || "").toUpperCase(); // "" (todos)

  const [views, catalog] = await Promise.all([listOrderViewsFast(), getCatalog()]);
  const prodDe = new Map(catalog.map((p) => [p.sku, p]));
  const sellerOf = buildSellerCanonicalizer(views.map((v) => v.order.seller));

  // Itens (paginados) — precisa da descrição também.
  const sb = getSupabaseAdmin();
  const allItems: { order_id: string; sku: string | null; description: string | null; quantity: number; unit_value: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("order_items")
      .select("order_id, sku, description, quantity, unit_value")
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

  // Monta TODAS as linhas bonificadas (item com valor unitário 0 e qtd > 0).
  const todas: LinhaBonificada[] = [];
  for (const v of views) {
    if (ehCancelado(v.order.tiny_status)) continue; // pedido cancelado não conta
    if (clienteIgnorado(v.customerName)) continue; // cliente interno (ex.: Exx Nutrition)
    if (pedidoNumIgnorado(v.order.order_number)) continue; // pedido excluído manualmente
    const dia = (v.order.order_date ?? "").slice(0, 10);
    const mes = dia.slice(0, 7);
    const uf = (v.order.state ?? "").toUpperCase() || "—";
    const its = itemsByOrder.get(v.order.id) ?? [];
    for (const i of its) {
      if ((i.unit_value ?? 0) > 0 || i.quantity <= 0) continue; // só bonificados
      const p = prodDe.get(i.sku ?? "");
      const custoUnit = p?.cost ?? 0;
      const valorUnit = p?.tabela ?? 0; // valor de tabela (mercado) do que foi investido
      todas.push({
        data: dia || null,
        mes: mes || "—",
        uf,
        pedido: v.order.order_number,
        cliente: v.customerName,
        vendedor: sellerOf(v.order.seller),
        sku: i.sku,
        produto: p?.name ?? i.description ?? i.sku ?? "Produto",
        quantidade: i.quantity,
        custoUnit,
        custoTotal: custoUnit * i.quantity,
        valorTotal: valorUnit * i.quantity,
      });
    }
  }

  // Opções de filtro (a partir de TODAS as linhas, antes de filtrar).
  const meses = [...new Set(todas.map((l) => l.mes).filter((m) => m !== "—"))].sort().reverse();
  const ufs = [...new Set(todas.map((l) => l.uf).filter((u) => u !== "—"))].sort();

  // Aplica filtros.
  const linhas = todas
    .filter((l) => (mesFiltro ? l.mes === mesFiltro : true))
    .filter((l) => (ufFiltro ? l.uf === ufFiltro : true))
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));

  // KPIs e resumo por produto.
  const custoInvestido = linhas.reduce((s, l) => s + l.custoTotal, 0);
  const valorMercado = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const unidades = linhas.reduce((s, l) => s + l.quantidade, 0);
  const pedidos = new Set(linhas.map((l) => l.pedido)).size;

  const porProdutoMap = new Map<string, { produto: string; quantidade: number; custoTotal: number; valorTotal: number }>();
  for (const l of linhas) {
    const k = l.sku ?? l.produto;
    const e = porProdutoMap.get(k) ?? { produto: l.produto, quantidade: 0, custoTotal: 0, valorTotal: 0 };
    e.quantidade += l.quantidade;
    e.custoTotal += l.custoTotal;
    e.valorTotal += l.valorTotal;
    porProdutoMap.set(k, e);
  }
  const porProduto = [...porProdutoMap.values()].sort((a, b) => b.custoTotal - a.custoTotal);

  const dados: DadosBonificados = {
    mesFiltro, ufFiltro, meses, ufs,
    kpis: { custoInvestido, valorMercado, unidades, pedidos, linhas: linhas.length },
    linhas: linhas.slice(0, 500),
    porProduto,
  };

  return <BonificadosClient dados={dados} />;
}

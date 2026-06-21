import Link from "next/link";
import { listOrderViewsFast } from "@/lib/queries";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { CATALOG } from "@/lib/product-costs";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const DEFAULT_PARAMS = { impostos: 7, comissao: 8, logistica: 7 };

function calcOrderMargin(
  items: { sku: string | null; quantity: number; unit_value: number }[],
) {
  const taxRate = (DEFAULT_PARAMS.impostos + DEFAULT_PARAMS.comissao + DEFAULT_PARAMS.logistica) / 100;
  let receita = 0;
  let custoProdutos = 0;
  let itensMapeados = 0;

  for (const item of items) {
    const produto = CATALOG.find((p) => p.sku === item.sku);
    const valorItem = item.unit_value * item.quantity;
    receita += valorItem;
    if (produto) {
      custoProdutos += produto.cost * item.quantity;
      itensMapeados++;
    }
  }

  const custosOp = receita * taxRate;
  const lucro = receita - custoProdutos - custosOp;
  const margem = receita > 0 ? (lucro / receita) * 100 : null;

  return { receita, custoProdutos, custosOp, lucro, margem, itensMapeados, totalItens: items.length };
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MargemBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">—</span>;
  const color = pct >= 20 ? "text-emerald-600" : pct >= 10 ? "text-amber-600" : "text-red-600";
  return <span className={`text-sm font-bold ${color}`}>{pct.toFixed(1)}%</span>;
}

function MargemBar({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const w = Math.min(Math.max(pct, 0), 100);
  const color = pct >= 20 ? "bg-emerald-500" : pct >= 10 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
      <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: "20%" }} />
    </div>
  );
}

export default async function OrdemMargemPage() {
  const views = await listOrderViewsFast();

  // Busca todos os order_items de uma vez
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

  const rows = views.map((v) => {
    const items = itemsByOrder.get(v.order.id) ?? [];
    const calc = calcOrderMargin(items);
    return { view: v, items, calc };
  });

  // Totais gerais
  const totalReceita = rows.reduce((s, r) => s + r.calc.receita, 0);
  const totalLucro = rows.reduce((s, r) => s + r.calc.lucro, 0);
  const totalCusto = rows.reduce((s, r) => s + r.calc.custoProdutos + r.calc.custosOp, 0);
  const margemGeral = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0;

  const semItens = rows.filter((r) => r.items.length === 0).length;
  const comItens = rows.filter((r) => r.items.length > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Margem de Pedidos"
        description="Margem real calculada com custo de produto + impostos + comissão + logística"
      />

      {/* Resumo geral */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total receita</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{fmtBRL(totalReceita)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total custo</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{fmtBRL(totalCusto)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Lucro total</div>
          <div className={`mt-1 text-xl font-bold ${totalLucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtBRL(totalLucro)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Margem geral</div>
          <div className={`mt-1 text-xl font-bold ${margemGeral >= 20 ? "text-emerald-600" : margemGeral >= 10 ? "text-amber-600" : "text-red-600"}`}>{margemGeral.toFixed(1)}%</div>
        </div>
      </div>

      {semItens > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <strong>{semItens}</strong> pedido(s) sem itens sincronizados — abra o detalhe do pedido para buscar itens do Tiny.
          <strong> {comItens}</strong> pedido(s) com itens.
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Pedido</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Receita</th>
                <th className="px-4 py-3 text-right">C. Produto</th>
                <th className="px-4 py-3 text-right">C. Operac.</th>
                <th className="px-4 py-3 text-right">Lucro</th>
                <th className="px-4 py-3 text-center">Margem</th>
                <th className="px-4 py-3 text-center">Itens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(({ view: v, items, calc }) => (
                <tr key={v.order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${v.order.id}`} className="font-semibold text-brand-700 hover:underline">
                      #{v.order.order_number}
                    </Link>
                    <div className="text-[10px] text-slate-400">{v.order.tiny_status ?? "—"}</div>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-slate-700">{v.customerName}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {v.order.tiny_status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{calc.receita > 0 ? fmtBRL(calc.receita) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{calc.custoProdutos > 0 ? fmtBRL(calc.custoProdutos) : "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{calc.custosOp > 0 ? fmtBRL(calc.custosOp) : "—"}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${calc.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {items.length > 0 ? fmtBRL(calc.lucro) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <MargemBadge pct={items.length > 0 ? calc.margem : null} />
                      <MargemBar pct={items.length > 0 ? calc.margem : null} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {items.length === 0 ? (
                      <Link href={`/orders/${v.order.id}`} className="text-xs text-amber-600 hover:underline">
                        Sincronizar
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {calc.itensMapeados}/{items.length}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Parâmetros usados: Impostos {DEFAULT_PARAMS.impostos}% · Comissão {DEFAULT_PARAMS.comissao}% · Logística {DEFAULT_PARAMS.logistica}%.
        Custo de produto vem do catálogo. Itens sem SKU mapeado no catálogo têm custo zerado.
      </p>
    </div>
  );
}

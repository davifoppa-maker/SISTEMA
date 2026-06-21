"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface OrderItem {
  sku: string | null;
  quantity: number;
  unit_value: number;
  catalog_cost: number | null;
  name: string;
}

interface Order {
  id: string;
  order_number: string;
  tiny_status: string | null;
  customerName: string;
  items: OrderItem[];
}

interface Params {
  impostos: number;
  comissao: number;
  logistica: number;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-slate-800">{value}%</span>
      </div>
      <input
        type="range" min={0} max={30} step={0.5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-700"
      />
    </div>
  );
}

function CostInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(value.toFixed(2));

  if (editing) {
    return (
      <input
        type="number" min={0} step={0.01} autoFocus value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const n = parseFloat(raw.replace(",", "."));
          if (!isNaN(n) && n >= 0) onChange(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 rounded border border-brand-700 px-1 py-0.5 text-right text-xs font-medium outline-none focus:ring-1 focus:ring-brand-700"
      />
    );
  }
  return (
    <button
      onClick={() => { setRaw(value.toFixed(2)); setEditing(true); }}
      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:border-brand-700 hover:bg-brand-50"
    >
      {fmtBRL(value)}
      <svg className="h-2.5 w-2.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
      </svg>
    </button>
  );
}

function MargemBar({ pct, min }: { pct: number | null; min: number }) {
  if (pct === null) return <span className="text-xs text-slate-400">—</span>;
  const w = Math.min(Math.max(pct, 0), 60);
  const color = pct >= min ? "bg-emerald-500" : pct >= min * 0.5 ? "bg-amber-400" : "bg-red-500";
  const textColor = pct >= min ? "text-emerald-600" : pct >= min * 0.5 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(w / 60) * 100}%` }} />
        <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: `${(min / 60) * 100}%` }} />
      </div>
      <span className={`text-sm font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
    </div>
  );
}

export function MargemPedidosClient({ orders }: { orders: Order[] }) {
  const [params, setParams] = useState<Params>({ impostos: 7, comissao: 8, logistica: 7 });
  const [margemMin, setMargemMin] = useState(20);
  // costOverrides: sku → custo editado pelo usuário
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});

  function getCost(sku: string | null, catalogCost: number | null): number {
    if (sku && costOverrides[sku] !== undefined) return costOverrides[sku];
    return catalogCost ?? 0;
  }

  function setCost(sku: string | null, value: number) {
    if (!sku) return;
    setCostOverrides((prev) => ({ ...prev, [sku]: value }));
  }

  const taxRate = (params.impostos + params.comissao + params.logistica) / 100;

  const rows = useMemo(() => {
    return orders.map((order) => {
      let receita = 0;
      let custoProdutos = 0;
      let itensMapeados = 0;

      for (const item of order.items) {
        receita += item.unit_value * item.quantity;
        const cost = getCost(item.sku, item.catalog_cost);
        if (cost > 0) itensMapeados++;
        custoProdutos += cost * item.quantity;
      }

      const custosOp = receita * taxRate;
      const lucro = receita - custoProdutos - custosOp;
      const margem = receita > 0 ? (lucro / receita) * 100 : null;

      return { order, receita, custoProdutos, custosOp, lucro, margem, itensMapeados };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, params, costOverrides]);

  const totalReceita = rows.reduce((s, r) => s + r.receita, 0);
  const totalLucro = rows.reduce((s, r) => s + r.lucro, 0);
  const totalCusto = rows.reduce((s, r) => s + r.custoProdutos + r.custosOp, 0);
  const margemGeral = totalReceita > 0 ? (totalLucro / totalReceita) * 100 : 0;
  const semItens = orders.filter((o) => o.items.length === 0).length;

  // Produtos únicos com custo para o painel lateral
  const uniqueSkus = useMemo(() => {
    const seen = new Map<string, { name: string; catalogCost: number | null }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.sku && !seen.has(item.sku)) {
          seen.set(item.sku, { name: item.name, catalogCost: item.catalog_cost });
        }
      }
    }
    return Array.from(seen.entries()).map(([sku, info]) => ({ sku, ...info }));
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Margem de Pedidos</h1>
        <p className="text-sm text-slate-500">Margem real por pedido — edite custos e parâmetros ao lado</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Conteúdo principal */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Cards de totais */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total receita", value: fmtBRL(totalReceita), color: "text-slate-800" },
              { label: "Total custo", value: fmtBRL(totalCusto), color: "text-slate-800" },
              { label: "Lucro total", value: fmtBRL(totalLucro), color: totalLucro >= 0 ? "text-emerald-600" : "text-red-600" },
              { label: "Margem geral", value: `${margemGeral.toFixed(1)}%`, color: margemGeral >= margemMin ? "text-emerald-600" : margemGeral >= margemMin * 0.5 ? "text-amber-600" : "text-red-600" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.label}</div>
                <div className={`mt-1 text-xl font-bold ${c.color}`}>{c.value}</div>
              </div>
            ))}
          </div>

          {semItens > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <strong>{semItens}</strong> pedido(s) sem itens — clique em "Atualizar pedidos" para sincronizar do Tiny.
            </div>
          )}

          {/* Tabela de pedidos */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Pedido</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Receita</th>
                    <th className="px-4 py-3 text-right">C. Produto</th>
                    <th className="px-4 py-3 text-right">C. Operac.</th>
                    <th className="px-4 py-3 text-right">Lucro</th>
                    <th className="px-4 py-3">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rows.map(({ order, receita, custoProdutos, custosOp, lucro, margem }) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`} className="font-semibold text-brand-700 hover:underline">
                          #{order.order_number}
                        </Link>
                        <div className="text-[10px] text-slate-400">{order.tiny_status ?? "—"}</div>
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-700">{order.customerName}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{receita > 0 ? fmtBRL(receita) : "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{custoProdutos > 0 ? fmtBRL(custoProdutos) : "—"}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{custosOp > 0 ? fmtBRL(custosOp) : "—"}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {order.items.length > 0 ? fmtBRL(lucro) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {order.items.length > 0
                          ? <MargemBar pct={margem} min={margemMin} />
                          : <Link href={`/orders/${order.id}`} className="text-xs text-amber-600 hover:underline">Sincronizar</Link>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Painel lateral */}
        <div className="flex flex-col gap-4 lg:w-72 shrink-0">
          {/* Parâmetros */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Parâmetros operacionais</h2>
            <div className="space-y-3">
              <Slider label="Impostos" value={params.impostos} onChange={(v) => setParams((p) => ({ ...p, impostos: v }))} />
              <Slider label="Comissão" value={params.comissao} onChange={(v) => setParams((p) => ({ ...p, comissao: v }))} />
              <Slider label="Logística" value={params.logistica} onChange={(v) => setParams((p) => ({ ...p, logistica: v }))} />
              <Slider label="Margem mínima" value={margemMin} onChange={setMargemMin} />
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Total operacional: <strong className="text-slate-700">{(params.impostos + params.comissao + params.logistica).toFixed(1)}%</strong>
            </div>
          </div>

          {/* Custos de produto */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Custo dos produtos</h2>
            <p className="mb-3 text-[10px] text-slate-400">Clique no valor para editar. Alterações aplicadas em tempo real.</p>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {uniqueSkus.length === 0 && (
                <p className="text-xs text-slate-400">Nenhum produto com SKU mapeado.</p>
              )}
              {uniqueSkus.map(({ sku, name, catalogCost }) => {
                const currentCost = getCost(sku, catalogCost);
                const isOverridden = costOverrides[sku] !== undefined;
                return (
                  <div key={sku} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-slate-700">{name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{sku}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isOverridden && (
                        <button
                          onClick={() => setCostOverrides((prev) => { const n = { ...prev }; delete n[sku]; return n; })}
                          className="text-[10px] text-brand-600 hover:underline"
                          title="Restaurar padrão"
                        >
                          ↺
                        </button>
                      )}
                      <CostInput value={currentCost} onChange={(v) => setCost(sku, v)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

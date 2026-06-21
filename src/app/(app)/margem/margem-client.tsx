"use client";

import { useState, useMemo } from "react";
import { CATALOG, Product } from "@/lib/product-costs";

interface OrderItem {
  sku: string;
  qty: number;
}

interface Params {
  impostos: number;
  comissao: number;
  logistica: number;
  margemMin: number;
}

type Level = "BASE" | "INTERMEDIÁRIO" | "AVANÇADO" | "PREMIUM";

interface LevelInfo {
  name: Level;
  discount: number;
  minVolume: number;
  minMix: number;
  color: string;
  bg: string;
}

const LEVELS: LevelInfo[] = [
  { name: "BASE", discount: 0.5, minVolume: 800, minMix: 0, color: "text-slate-700", bg: "bg-slate-100" },
  { name: "INTERMEDIÁRIO", discount: 0.55, minVolume: 5000, minMix: 30, color: "text-blue-700", bg: "bg-blue-100" },
  { name: "AVANÇADO", discount: 0.6, minVolume: 10000, minMix: 40, color: "text-violet-700", bg: "bg-violet-100" },
  { name: "PREMIUM", discount: 0.65, minVolume: 20000, minMix: 50, color: "text-amber-700", bg: "bg-amber-100" },
];

function getLevel(volumeTabela: number, mixPct: number): LevelInfo {
  if (volumeTabela >= 20000 && mixPct >= 50) return LEVELS[3];
  if (volumeTabela >= 10000 && mixPct >= 40) return LEVELS[2];
  if (volumeTabela >= 5000 && mixPct >= 30) return LEVELS[1];
  return LEVELS[0];
}

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function TypeBadge({ type }: { type: Product["type"] }) {
  if (type === "proteico")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700">Proteico</span>;
  if (type === "nao_proteico")
    return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700">Não-proteico</span>;
  return <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600">Acessório</span>;
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-slate-800">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-700"
      />
    </div>
  );
}

export function MargemClient() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [params, setParams] = useState<Params>({ impostos: 7, comissao: 8, logistica: 7, margemMin: 20 });
  const [search, setSearch] = useState("");

  const filteredCatalog = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [search]);

  function getQty(sku: string) {
    return items.find((i) => i.sku === sku)?.qty ?? 0;
  }

  function setQty(sku: string, qty: number) {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.sku !== sku));
    } else {
      setItems((prev) => {
        const exists = prev.find((i) => i.sku === sku);
        if (exists) return prev.map((i) => (i.sku === sku ? { ...i, qty } : i));
        return [...prev, { sku, qty }];
      });
    }
  }

  // Derived calculations
  const calculations = useMemo(() => {
    const orderProducts = items
      .map((item) => {
        const product = CATALOG.find((p) => p.sku === item.sku)!;
        return { product, qty: item.qty };
      })
      .filter((i) => i.product);

    const totalTabela = orderProducts.reduce((s, i) => s + i.product.tabela * i.qty, 0);
    const nonProteinTabela = orderProducts
      .filter((i) => i.product.type !== "proteico")
      .reduce((s, i) => s + i.product.tabela * i.qty, 0);
    const mixPct = totalTabela > 0 ? (nonProteinTabela / totalTabela) * 100 : 0;

    const level = getLevel(totalTabela, mixPct);
    const discount = level.discount;

    const receita = orderProducts.reduce((s, i) => s + i.product.tabela * (1 - discount) * i.qty, 0);
    const custoProdutos = orderProducts.reduce((s, i) => s + i.product.cost * i.qty, 0);
    const taxRate = (params.impostos + params.comissao + params.logistica) / 100;
    const custosOperacionais = taxRate * receita;
    const custoTotal = custoProdutos + custosOperacionais;
    const lucro = receita - custoTotal;
    const margemPct = receita > 0 ? (lucro / receita) * 100 : 0;

    // Next level info
    const currentLevelIdx = LEVELS.findIndex((l) => l.name === level.name);
    const nextLevel = currentLevelIdx < LEVELS.length - 1 ? LEVELS[currentLevelIdx + 1] : null;
    const volumeProgress = nextLevel
      ? Math.min((totalTabela / nextLevel.minVolume) * 100, 100)
      : 100;

    return {
      totalTabela,
      mixPct,
      level,
      discount,
      receita,
      custoProdutos,
      custosOperacionais,
      custoTotal,
      lucro,
      margemPct,
      nextLevel,
      volumeProgress,
      orderProducts,
    };
  }, [items, params]);

  const { level, mixPct, totalTabela, volumeProgress, nextLevel, receita, custoProdutos, custosOperacionais, lucro, margemPct, orderProducts, discount } = calculations;

  return (
    <div className="flex h-full flex-col gap-0">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-bold text-slate-800">Gestor de Margem</h1>
        <p className="text-sm text-slate-500">Simule pedidos e acompanhe descontos por volume e mix</p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 lg:flex-row lg:overflow-hidden">
        {/* Left panel */}
        <div className="flex flex-1 flex-col gap-4 lg:overflow-hidden" style={{ flex: "2 1 0" }}>
          {/* Search */}
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-700 focus:ring-1 focus:ring-brand-700"
          />

          {/* Catalog grid */}
          <div className="overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCatalog.map((product) => {
                const qty = getQty(product.sku);
                const netPrice = product.tabela * (1 - discount);
                return (
                  <div key={product.sku} className="flex flex-col gap-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {product.sku}
                          </span>
                          <TypeBadge type={product.type} />
                        </div>
                        <p className="mt-1 text-xs font-medium leading-tight text-slate-800">{product.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-slate-400 line-through">{fmtBRL(product.tabela)}</span>
                        <span className="ml-1.5 text-sm font-semibold text-emerald-600">{fmtBRL(netPrice)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQty(product.sku, qty - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          disabled={qty === 0}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-slate-800">{qty}</span>
                        <button
                          onClick={() => setQty(product.sku, qty + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-700 bg-brand-700 text-white hover:bg-brand-800"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order table */}
          {orderProducts.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Itens do pedido</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2">Produto</th>
                      <th className="px-4 py-2 text-right">Qtd</th>
                      <th className="px-4 py-2 text-right">Tabela unit</th>
                      <th className="px-4 py-2 text-right">Líquido unit</th>
                      <th className="px-4 py-2 text-right">Total líquido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orderProducts.map(({ product, qty }) => {
                      const netUnit = product.tabela * (1 - discount);
                      return (
                        <tr key={product.sku} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-800">{product.name}</div>
                            <div className="font-mono text-[10px] text-slate-400">{product.sku}</div>
                          </td>
                          <td className="px-4 py-2 text-right text-slate-700">{qty}</td>
                          <td className="px-4 py-2 text-right text-slate-400 line-through">{fmtBRL(product.tabela)}</td>
                          <td className="px-4 py-2 text-right text-emerald-600">{fmtBRL(netUnit)}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-800">{fmtBRL(netUnit * qty)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={4} className="px-4 py-2 text-right text-xs font-medium text-slate-600">Total Receita</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800">{fmtBRL(receita)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col gap-4 lg:overflow-y-auto" style={{ flex: "1 1 0", minWidth: "280px", maxWidth: "100%" }}>
          {/* Sistema de Pontos */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Sistema de Pontos</h2>
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${level.bg} ${level.color}`}>
                {level.name}
              </span>
              <span className="text-sm font-semibold text-slate-700">{(level.discount * 100).toFixed(0)}% desc.</span>
            </div>

            <div className="mb-2 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Volume tabela</span>
                <span className="font-medium text-slate-700">{fmtBRL(totalTabela)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-700 transition-all"
                  style={{ width: `${volumeProgress}%` }}
                />
              </div>
              {nextLevel && (
                <p className="text-[10px] text-slate-400">
                  Meta próximo nível: {fmtBRL(nextLevel.minVolume)} + {nextLevel.minMix}% mix
                </p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
              <span className="text-xs text-slate-600">Mix não-proteico</span>
              <span className={`text-sm font-bold ${mixPct >= (level.minMix ?? 0) ? "text-emerald-600" : "text-red-500"}`}>
                {mixPct.toFixed(1)}%
              </span>
            </div>

            {/* Level table */}
            <div className="mt-3 space-y-1">
              {LEVELS.map((l) => {
                const active = l.name === level.name;
                return (
                  <div
                    key={l.name}
                    className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs ${active ? `${l.bg} font-semibold ${l.color}` : "text-slate-500"}`}
                  >
                    <span>{l.name}</span>
                    <span>{(l.discount * 100).toFixed(0)}%</span>
                    <span>{fmtBRL(l.minVolume)}{l.minMix > 0 ? ` + ${l.minMix}% mix` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Parâmetros */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Parâmetros</h2>
            <div className="space-y-3">
              <Slider label="Impostos" value={params.impostos} min={0} max={20} onChange={(v) => setParams((p) => ({ ...p, impostos: v }))} />
              <Slider label="Comissão" value={params.comissao} min={0} max={20} onChange={(v) => setParams((p) => ({ ...p, comissao: v }))} />
              <Slider label="Logística" value={params.logistica} min={0} max={20} onChange={(v) => setParams((p) => ({ ...p, logistica: v }))} />
              <Slider label="Margem mínima" value={params.margemMin} min={0} max={40} onChange={(v) => setParams((p) => ({ ...p, margemMin: v }))} />
            </div>
          </div>

          {/* Resultado */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Resultado</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Receita</span>
                <span className="font-medium text-slate-800">{fmtBRL(receita)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Custo produtos</span>
                <span className="font-medium text-slate-800">{fmtBRL(custoProdutos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Custos operacionais</span>
                <span className="font-medium text-slate-800">{fmtBRL(custosOperacionais)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2">
                <span className="text-slate-500">Lucro</span>
                <span className={`font-semibold ${lucro >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmtBRL(lucro)}</span>
              </div>
            </div>

            {/* Margem bar */}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-slate-500">Margem</span>
                <span className={`font-bold ${margemPct >= params.margemMin ? "text-emerald-600" : "text-red-500"}`}>
                  {margemPct.toFixed(1)}%
                </span>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${margemPct >= params.margemMin ? "bg-emerald-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(Math.max(margemPct, 0), 100)}%` }}
                />
                {/* Min marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-slate-500"
                  style={{ left: `${Math.min(params.margemMin, 100)}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                Mínimo: {params.margemMin}%
                {margemPct < params.margemMin && receita > 0 && (
                  <span className="ml-1 font-medium text-red-500">Abaixo do mínimo</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

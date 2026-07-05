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

// Pontos mínimos para o representante aprovar um pedido.
const PONTOS_MIN = 26;

// Piadas/comemorações quando o vendedor BATE a meta de pontos. 🎉
const PIADAS_META = [
  "🏆 Bateu a meta! Tá vendendo mais que pão na padaria!",
  "🚀 Aprovado! Esse pedido decolou como foguete!",
  "🔥 Tá pegando fogo, bicho! Pedido liberado!",
  "💪 Monstro! Esse pedido passou raspando na academia dos pontos!",
  "🤑 Dinheiro na conta! A margem agradece e o chefe também!",
  "🎯 Na mosca! Mais um pedido pra conta do vendedor TOP!",
  "🥇 Ouro olímpico! Esse pedido merece pódio!",
  "😎 Fácil demais pra você, hein? Tá contratado!",
  "🍾 Champanhe! Esse pedido é motivo de comemoração!",
  "⚡ Rápido e certeiro! O cliente nem viu de onde veio a venda!",
];

// Frases de incentivo quando ainda FALTAM pontos. 💪
const FRASES_FALTA = [
  "Quase lá! Capricha no mix não-proteico! 💪",
  "Tá chegando! Mais um empurrãozinho! 🚀",
  "Falta pouco pro pódio! Bora! 🎯",
  "Adiciona mais uns itens que a meta é sua! 🔥",
  "O ouro tá logo ali! Não desiste! 🥇",
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

function QtyCell({ qty, onSet }: { qty: number; onSet: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(qty));

  if (editing) {
    return (
      <input
        type="number"
        min={1}
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const n = parseInt(val);
          if (!isNaN(n) && n > 0) onSet(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-14 rounded border border-brand-700 px-1 py-0.5 text-right text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-brand-700"
      />
    );
  }

  return (
    <button
      onClick={() => { setVal(String(qty)); setEditing(true); }}
      className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/10 px-2 py-0.5 text-white hover:border-fuchsia-400 hover:bg-white/20"
    >
      <span className="text-sm font-medium">{qty}</span>
      <svg className="h-3 w-3 text-violet-300/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
      </svg>
    </button>
  );
}

function LiquidoCell({ value, onSet }: { value: number; onSet: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value.toFixed(2));

  if (editing) {
    return (
      <input
        type="number" min={0} step={0.01} autoFocus value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const n = parseFloat(val.replace(",", "."));
          if (!isNaN(n) && n >= 0) onSet(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 rounded border border-brand-700 px-1 py-0.5 text-right text-sm font-medium text-slate-800 outline-none focus:ring-1 focus:ring-brand-700"
      />
    );
  }
  return (
    <button
      onClick={() => { setVal(value.toFixed(2)); setEditing(true); }}
      className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-emerald-600 hover:border-brand-700 hover:bg-brand-50"
    >
      <span className="text-sm font-medium">{fmtBRL(value)}</span>
      <svg className="h-3 w-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
      </svg>
    </button>
  );
}

export function MargemClient() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [params, setParams] = useState<Params>({ impostos: 7, comissao: 8, logistica: 7, margemMin: 20 });
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  // Overrides de preço líquido por SKU (quando usuário edita manualmente)
  const [liquidoOverrides, setLiquidoOverrides] = useState<Record<string, number>>({});

  const filteredCatalog = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return CATALOG.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 10);
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

    const receita = orderProducts.reduce((s, i) => {
      const netUnit = liquidoOverrides[i.product.sku] ?? i.product.tabela * (1 - discount);
      return s + netUnit * i.qty;
    }, 0);
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
  }, [items, params, liquidoOverrides]);

  const { level, mixPct, totalTabela, volumeProgress, nextLevel, receita, custoProdutos, custosOperacionais, lucro, margemPct, orderProducts, discount } = calculations;

  return (
    <div className="-mx-4 -mt-16 min-h-screen bg-[radial-gradient(ellipse_at_top,_#3b0764_0%,_#1e1b4b_45%,_#0f172a_100%)] px-4 pt-16 text-white sm:-mx-6 sm:px-6 md:-mt-6 md:pt-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">
          <span className="text-3xl">🎮</span> Gestor de Margem
        </h1>
        <p className="text-sm text-violet-200/80">Monte o pedido, some pontos e bata a meta! 🚀</p>
      </div>

      <div className="flex flex-1 flex-col gap-4 pb-8 lg:flex-row">
        {/* Left panel */}
        <div className="flex flex-1 flex-col gap-4" style={{ flex: "2 1 0" }}>
          {/* Search with autocomplete */}
          <div className="relative">
            <input
              type="text"
              placeholder="🔎 Buscar produto por nome ou SKU..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-violet-200/60 shadow-lg outline-none backdrop-blur-md focus:border-fuchsia-400 focus:ring-1 focus:ring-fuchsia-400"
            />
            {showDropdown && filteredCatalog.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-white/15 bg-slate-900/95 shadow-2xl backdrop-blur-md">
                {filteredCatalog.map((product) => {
                  const qty = getQty(product.sku);
                  const netPrice = product.tabela * (1 - discount);
                  return (
                    <div
                      key={product.sku}
                      className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/10"
                      onMouseDown={() => {
                        setQty(product.sku, qty + 1);
                        setSearch("");
                        setShowDropdown(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] text-violet-300/70">{product.sku}</span>
                          <TypeBadge type={product.type} />
                        </div>
                        <p className="text-xs font-medium text-white">{product.name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] text-violet-300/50 line-through">{fmtBRL(product.tabela)}</div>
                        <div className="text-sm font-semibold text-emerald-400">{fmtBRL(netPrice)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Order table */}
          {orderProducts.length > 0 && (
            <div className="rounded-xl border border-white/15 bg-white/5 shadow-lg backdrop-blur-md">
              <div className="border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">🛒 Itens do pedido</h2>
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
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {orderProducts.map(({ product, qty }) => {
                      const netUnit = liquidoOverrides[product.sku] ?? product.tabela * (1 - discount);
                      const isOverridden = liquidoOverrides[product.sku] !== undefined;
                      return (
                        <tr key={product.sku} className="hover:bg-slate-50">
                          <td className="px-4 py-2">
                            <div className="font-medium text-slate-800">{product.name}</div>
                            <div className="font-mono text-[10px] text-slate-400">{product.sku}</div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <QtyCell qty={qty} onSet={(v) => setQty(product.sku, v)} />
                          </td>
                          <td className="px-4 py-2 text-right text-slate-400 line-through">{fmtBRL(product.tabela)}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isOverridden && (
                                <button
                                  onClick={() => setLiquidoOverrides((p) => { const n = { ...p }; delete n[product.sku]; return n; })}
                                  className="text-[10px] text-brand-600 hover:underline"
                                  title="Restaurar desconto automático"
                                >↺</button>
                              )}
                              <LiquidoCell
                                value={netUnit}
                                onSet={(v) => setLiquidoOverrides((p) => ({ ...p, [product.sku]: v }))}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-800">{fmtBRL(netUnit * qty)}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => setQty(product.sku, 0)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="Remover produto"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={5} className="px-4 py-2 text-right text-xs font-medium text-slate-600">Total Receita</td>
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
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 shadow-lg backdrop-blur-md">
            <h2 className="mb-3 text-sm font-semibold text-white">🏅 Sistema de Pontos</h2>
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

          {/* Pontos do pedido (visão gamificada do representante) */}
          {(() => {
            const pontos = Math.max(0, Math.round(margemPct));
            const aprovado = pontos >= PONTOS_MIN;
            const faltam = Math.max(0, PONTOS_MIN - pontos);
            const progresso = Math.min((pontos / PONTOS_MIN) * 100, 100);
            // Frase determinística (pelos pontos) — evita divergência de hidratação.
            const piada = PIADAS_META[pontos % PIADAS_META.length];
            const incentivo = FRASES_FALTA[pontos % FRASES_FALTA.length];
            return (
              <div
                className={`overflow-hidden rounded-2xl border border-violet-400 text-white shadow-lg transition-all ${
                  aprovado
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                    : "bg-gradient-to-br from-violet-600 to-fuchsia-600"
                }`}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-white/90">
                      🎮 Sua pontuação
                    </h2>
                    <span className="text-xs text-white/80">Receita {fmtBRL(receita)}</span>
                  </div>

                  {/* Número grande */}
                  <div className="mt-3 text-center">
                    <div className="text-6xl font-black leading-none text-white drop-shadow">
                      {pontos}
                    </div>
                    <div className="text-sm font-semibold text-white/80">
                      de {PONTOS_MIN} pontos
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div className="relative mt-4 h-5 w-full overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-500"
                      style={{ width: `${progresso}%` }}
                    />
                    {progresso > 12 && (
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-violet-800">
                        {Math.round(progresso)}%
                      </span>
                    )}
                  </div>

                  {/* Mensagem / piada */}
                  <div className="mt-4">
                    {receita <= 0 ? (
                      <div className="rounded-xl bg-white/20 px-3 py-3 text-center text-sm font-medium text-white">
                        👋 Monte o pedido buscando os produtos e veja sua pontuação subir!
                      </div>
                    ) : aprovado ? (
                      <div className="rounded-xl bg-white/25 px-3 py-3 text-center text-sm font-bold text-white">
                        {piada}
                      </div>
                    ) : (
                      <div className="rounded-xl bg-white/20 px-3 py-3 text-center">
                        <p className="text-sm font-bold text-white">🔒 Faltam {faltam} ponto(s)!</p>
                        <p className="mt-0.5 text-xs text-white/85">{incentivo}</p>
                      </div>
                    )}
                  </div>

                  <p className="mt-3 text-center text-[11px] text-white/70">
                    Meta: {PONTOS_MIN} pontos para aprovar. Mais mix não-proteico e volume = mais pontos. 🚀
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export interface LinhaBonificada {
  data: string | null;
  mes: string;
  uf: string;
  pedido: string;
  cliente: string;
  vendedor: string;
  sku: string | null;
  produto: string;
  quantidade: number;
  custoUnit: number;
  custoTotal: number;
  valorTotal: number;
}

export interface DadosBonificados {
  mesFiltro: string;
  ufFiltro: string;
  meses: string[];
  ufs: string[];
  kpis: { custoInvestido: number; valorMercado: number; unidades: number; pedidos: number; linhas: number };
  linhas: LinhaBonificada[];
  porProduto: { produto: string; quantidade: number; custoTotal: number; valorTotal: number }[];
  porEstado: { uf: string; quantidade: number; custoTotal: number; valorTotal: number; pedidos: number; pct: number }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function mesLabel(m: string) {
  const [y, mm] = m.split("-");
  const nomes = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[Number(mm)] ?? mm}/${y}`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

function fmtData(d: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export function BonificadosClient({ dados }: { dados: DadosBonificados }) {
  const { kpis, linhas, porProduto, porEstado, meses, ufs } = dados;
  const [aba, setAba] = useState<"produtos" | "estados" | "detalhe">("produtos");

  return (
    <>
      <PageHeader
        title="🎁 Pedidos Bonificados"
        description="Produtos investidos (valor zero). Não entram na margem — são medidos aqui como investimento."
      />

      {/* Filtros mês / estado */}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Mês</label>
          <select name="mes" defaultValue={dados.mesFiltro} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white">
            <option value="">Todos</option>
            {meses.map((m) => (
              <option key={m} value={m}>{mesLabel(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Estado</label>
          <select name="uf" defaultValue={dados.ufFiltro} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white">
            <option value="">Todos</option>
            {ufs.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <button className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">Aplicar</button>
      </form>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Custo investido" value={brl(kpis.custoInvestido)} sub="custo real dos brindes" />
        <Kpi label="Valor de mercado" value={brl(kpis.valorMercado)} sub="preço de tabela investido" />
        <Kpi label="Unidades" value={String(kpis.unidades)} sub={`${kpis.linhas} itens bonificados`} />
        <Kpi label="Pedidos" value={String(kpis.pedidos)} sub="com bonificação" />
      </div>

      {/* Resumo por produto */}
      {/* Abas */}
      <div className="mb-4 flex gap-1 border-b border-white/10">
        {([["produtos", "Por produto"], ["estados", "Por estado"], ["detalhe", "Detalhe"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setAba(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              aba === k ? "border-amber-400 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

{aba === "produtos" ? (
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">📦 Investimento por produto</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2 text-right">Unid.</th>
                  <th className="px-4 py-2 text-right">Custo investido</th>
                  <th className="px-4 py-2 text-right">Valor de mercado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {porProduto.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sem bonificações no filtro.</td></tr>
                ) : porProduto.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-white">{p.produto}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{p.quantidade}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-400">{brl(p.custoTotal)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(p.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
) : null}

{aba === "estados" ? (
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Bonificação por estado (UF)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">UF</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                  <th className="px-4 py-2 text-right">Unid.</th>
                  <th className="px-4 py-2 text-right">Custo investido</th>
                  <th className="px-4 py-2 text-right">Valor de mercado</th>
                  <th className="px-4 py-2">% do investido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {porEstado.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sem bonificações no período.</td></tr>
                ) : porEstado.map((e) => (
                  <tr key={e.uf}>
                    <td className="px-4 py-2 font-semibold text-white">{e.uf}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{e.pedidos}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{e.quantidade}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-400">{brl(e.custoTotal)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(e.valorTotal)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(e.pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{e.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
) : null}

{aba === "detalhe" ? (
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">🧾 Detalhe dos itens bonificados</h2>
            {kpis.linhas > linhas.length ? (
              <p className="text-[11px] text-slate-400">Mostrando os {linhas.length} mais recentes de {kpis.linhas}.</p>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">UF</th>
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2 text-right">Qtd</th>
                  <th className="px-4 py-2 text-right">Custo un.</th>
                  <th className="px-4 py-2 text-right">Custo total</th>
                  <th className="px-4 py-2 text-right">Valor tabela</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {linhas.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">Sem bonificações no filtro.</td></tr>
                ) : linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-300">{fmtData(l.data)}</td>
                    <td className="px-4 py-2 text-slate-300">{l.uf}</td>
                    <td className="px-4 py-2 text-slate-400">#{l.pedido}</td>
                    <td className="px-4 py-2 text-white">{l.cliente}</td>
                    <td className="px-4 py-2 text-slate-300">{l.vendedor}</td>
                    <td className="px-4 py-2 text-white">{l.produto}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{l.quantidade}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{brl(l.custoUnit)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-400">{brl(l.custoTotal)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(l.valorTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
) : null}
    </>
  );
}

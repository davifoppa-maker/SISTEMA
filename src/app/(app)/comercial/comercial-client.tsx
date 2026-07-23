"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo, Fragment } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export interface DadosComercial {
  de: string;
  ate: string;
  kpis: {
    faturamento: number;
    pedidos: number;
    ticketMedio: number;
    margem: number;
    positivacao: number;
    clientesPositivados: number;
    carteiraTotal: number;
    clientesNovos: number;
    primeirasVendas: number;
  };
  vendedores: {
    nome: string;
    faturamento: number;
    pedidos: number;
    ticketMedio: number;
    margem: number;
    clientesPositivados: number;
    carteira: number;
    positivacao: number;
    clientesNovos: number;
    primeirasVendas: number;
    lista: { numero: string; data: string; cliente: string; valor: number; frete: number }[];
  }[];
  abc: { nome: string; receita: number; pctAcum: number; classe: string }[];
  positivar: {
    cliente: string;
    vendedor: string;
    ultimaCompra: string;
    diasSemComprar: number;
    pedidos: number;
    faturamentoTotal: number;
  }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      {sub ? <div className="text-[11px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

const classeCor: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-400",
  B: "bg-amber-500/20 text-amber-400",
  C: "bg-slate-500/20 text-slate-400",
};

export function ComercialClient({ dados }: { dados: DadosComercial }) {
  const { kpis, vendedores, abc } = dados;
  const router = useRouter();

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const irPara = (de: string, ate: string) => router.push(`/comercial?de=${de}&ate=${ate}`);

  // Seleciona um mês inteiro (input type=month → YYYY-MM).
  const aplicarMes = (m: string) => {
    if (!m) return;
    const [y, mm] = m.split("-").map(Number);
    const de = `${y}-${String(mm).padStart(2, "0")}-01`;
    const ultimo = new Date(y, mm, 0).getDate();
    const ate = `${y}-${String(mm).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
    irPara(de, ate);
  };

  // Atalhos rápidos.
  const hoje = new Date();
  const esteMes = () => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1); irPara(iso(d), iso(hoje)); };
  const mesPassado = () => {
    const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    irPara(iso(ini), iso(fim));
  };
  const ultimosDias = (n: number) => { const d = new Date(hoje.getTime() - n * 86400000); irPara(iso(d), iso(hoje)); };
  const esteAno = () => { const d = new Date(hoje.getFullYear(), 0, 1); irPara(iso(d), iso(hoje)); };

  const mesAtual = dados.de.slice(0, 7);

  // Abas do dashboard.
  const [aba, setAba] = useState<"faturamento" | "positivacao">("faturamento");
  // Vendedor expandido (mostra os pedidos para validar contra o Olist).
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="📊 Dashboard Comercial" description="Desempenho de vendas por vendedor, carteira e curva ABC." />

      {/* Abas */}
      <div className="mb-5 flex gap-1 border-b border-white/10">
        {([["faturamento", "Faturamento"], ["positivacao", "Positivação"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setAba(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              aba === key ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === "positivacao" ? <PositivacaoPanel positivar={dados.positivar} /> : null}

      <div className={aba === "faturamento" ? "" : "hidden"}>
      {/* Filtro de período */}
      <div className="mb-4 space-y-3">
        {/* Atalhos rápidos */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Este mês", fn: esteMes },
            { label: "Mês passado", fn: mesPassado },
            { label: "Últimos 30 dias", fn: () => ultimosDias(30) },
            { label: "Últimos 90 dias", fn: () => ultimosDias(90) },
            { label: "Este ano", fn: esteAno },
          ].map((b) => (
            <button key={b.label} type="button" onClick={b.fn}
              className="h-8 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-slate-200 hover:bg-white/10">
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Seletor de MÊS */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Mês</label>
            <input type="month" defaultValue={mesAtual}
              onChange={(e) => aplicarMes(e.target.value)}
              className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white" />
          </div>

          <span className="pb-2 text-xs text-slate-500">ou intervalo:</span>

          {/* Intervalo de dias */}
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">De</label>
              <input type="date" name="de" defaultValue={dados.de} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Até</label>
              <input type="date" name="ate" defaultValue={dados.ate} className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white" />
            </div>
            <button className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700">Aplicar</button>
          </form>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Faturamento" value={brl(kpis.faturamento)} sub={`${kpis.pedidos} pedidos`} />
        <Kpi label="Ticket médio" value={brl(kpis.ticketMedio)} />
        <Kpi label="Margem líquida" value={`${kpis.margem.toFixed(1)}%`} />
        <Kpi label="Positivação" value={`${kpis.positivacao.toFixed(1)}%`} sub={`${kpis.clientesPositivados}/${kpis.carteiraTotal} clientes`} />
        <Kpi label="Clientes ativos" value={String(kpis.clientesPositivados)} sub="no período" />
        <Kpi label="Clientes novos" value={String(kpis.clientesNovos)} sub={`${brl(kpis.primeirasVendas)} em 1ª venda`} />
      </div>

      {/* Por vendedor */}
      <Card className="mb-5">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">🏆 Desempenho por vendedor</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2 text-right">Faturamento</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                  <th className="px-4 py-2 text-right">Ticket médio</th>
                  <th className="px-4 py-2 text-right">Margem líq.</th>
                  <th className="px-4 py-2 text-right">Clientes novos</th>
                  <th className="px-4 py-2 text-right">1ª venda (R$)</th>
                  <th className="px-4 py-2 text-right">Positivação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {vendedores.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Sem vendas no período.</td></tr>
                ) : vendedores.map((v) => (
                  <Fragment key={v.nome}>
                  <tr className="cursor-pointer hover:bg-white/5" onClick={() => setAberto(aberto === v.nome ? null : v.nome)}>
                    <td className="px-4 py-2 font-medium text-white">
                      <span className="mr-1 inline-block text-slate-500">{aberto === v.nome ? "▾" : "▸"}</span>{v.nome}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-white">{brl(v.faturamento)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{v.pedidos}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(v.ticketMedio)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${v.margem >= 26 ? "text-emerald-400" : v.margem >= 0 ? "text-amber-400" : "text-red-400"}`}>
                      {v.margem.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-sky-300">{v.clientesNovos}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(v.primeirasVendas)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {v.positivacao.toFixed(0)}% <span className="text-[10px] text-slate-500">({v.clientesPositivados}/{v.carteira})</span>
                    </td>
                  </tr>
                  {aberto === v.nome ? (
                    <tr key={v.nome + "-exp"}>
                      <td colSpan={8} className="bg-black/20 px-4 py-3">
                        <div className="overflow-x-auto rounded-lg border border-white/10">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-white/10 text-left text-slate-400">
                                <th className="px-3 py-1.5">Pedido</th>
                                <th className="px-3 py-1.5">Data</th>
                                <th className="px-3 py-1.5">Cliente</th>
                                <th className="px-3 py-1.5 text-right">Valor (c/ frete)</th>
                                <th className="px-3 py-1.5 text-right">Frete</th>
                                <th className="px-3 py-1.5 text-right">Valor s/ frete</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {v.lista.map((p) => (
                                <tr key={p.numero}>
                                  <td className="px-3 py-1.5 font-medium text-violet-300">#{p.numero}</td>
                                  <td className="px-3 py-1.5 text-slate-400">{p.data.split("-").reverse().join("/")}</td>
                                  <td className="px-3 py-1.5 text-slate-300">{p.cliente}</td>
                                  <td className="px-3 py-1.5 text-right text-white">{brl(p.valor)}</td>
                                  <td className="px-3 py-1.5 text-right text-slate-400">{brl(p.frete)}</td>
                                  <td className="px-3 py-1.5 text-right text-slate-300">{brl(p.valor - p.frete)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10 font-semibold text-white">
                                <td className="px-3 py-1.5" colSpan={3}>Total ({v.lista.length})</td>
                                <td className="px-3 py-1.5 text-right">{brl(v.lista.reduce((s, p) => s + p.valor, 0))}</td>
                                <td className="px-3 py-1.5 text-right text-slate-400">{brl(v.lista.reduce((s, p) => s + p.frete, 0))}</td>
                                <td className="px-3 py-1.5 text-right">{brl(v.lista.reduce((s, p) => s + p.valor - p.frete, 0))}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Curva ABC */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">📈 Curva ABC de produtos (por receita)</h2>
            <p className="text-[11px] text-slate-400">A = 80% do faturamento · B = próximos 15% · C = os 5% finais</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                  <th className="px-4 py-2 text-right">% acum.</th>
                  <th className="px-4 py-2 text-center">Classe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {abc.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sem dados.</td></tr>
                ) : abc.map((p, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2 text-white">{p.nome}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(p.receita)}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{p.pctAcum.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${classeCor[p.classe]}`}>{p.classe}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  );
}

// ————————————————————————————————————————————————————————————————
// Aba de Positivação: clientes que pararam de comprar (por vendedor / faixa de dias).
function PositivacaoPanel({ positivar }: { positivar: DadosComercial["positivar"] }) {
  const [vendedor, setVendedor] = useState("");
  const [minDias, setMinDias] = useState(30);

  const vendedores = useMemo(
    () => [...new Set(positivar.map((c) => c.vendedor))].sort((a, b) => a.localeCompare(b)),
    [positivar],
  );
  const lista = useMemo(
    () => positivar.filter((c) => c.diasSemComprar >= minDias && (!vendedor || c.vendedor === vendedor)),
    [positivar, minDias, vendedor],
  );

  const faixa = (d: number) =>
    d >= 90 ? { txt: "90+ dias", cls: "bg-red-500/20 text-red-400" }
    : d >= 60 ? { txt: "60–89 dias", cls: "bg-orange-500/20 text-orange-400" }
    : { txt: "30–59 dias", cls: "bg-amber-500/20 text-amber-400" };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-slate-300">
          Clientes que <b className="text-white">já compraram</b> mas <b className="text-white">não recompram</b> há um tempo —
          estão na hora de <b className="text-violet-300">positivar</b>. Ordenados pelos mais atrasados.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Vendedor</label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white">
            <option value="">Todos</option>
            {vendedores.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Sem comprar há</label>
          <select value={minDias} onChange={(e) => setMinDias(Number(e.target.value))}
            className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white">
            <option value={30}>+30 dias</option>
            <option value={45}>+45 dias</option>
            <option value={60}>+60 dias</option>
            <option value={90}>+90 dias</option>
          </select>
        </div>
        <span className="pb-2 text-xs text-slate-500">{lista.length} cliente(s) para positivar</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2 text-right">Última compra</th>
                  <th className="px-4 py-2 text-right">Sem comprar</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                  <th className="px-4 py-2 text-right">Faturamento total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lista.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhum cliente nesse critério. 🎉</td></tr>
                ) : lista.map((c, i) => {
                  const f = faixa(c.diasSemComprar);
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 font-medium text-white">{c.cliente}</td>
                      <td className="px-4 py-2 text-slate-300">{c.vendedor}</td>
                      <td className="px-4 py-2 text-right text-slate-300">{c.ultimaCompra.split("-").reverse().join("/")}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${f.cls}`}>{c.diasSemComprar} d</span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">{c.pedidos}</td>
                      <td className="px-4 py-2 text-right font-semibold text-white">{brl(c.faturamentoTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

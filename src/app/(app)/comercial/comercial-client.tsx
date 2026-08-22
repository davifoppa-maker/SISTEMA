"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect, Fragment } from "react";
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
    margemCobertura: number;
    fatSemMargem: number;
    pedidosSemMargem: number;
    pedidosBonificados: number;
    pedidosSemCusto: number;
    pedidosSemItens: number;
  };
  vendedores: {
    nome: string;
    faturamento: number;
    pedidos: number;
    ticketMedio: number;
    margem: number;
    margemCobertura: number;
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
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {/* Fonte encolhe conforme o tamanho do número, para nunca vazar do card. */}
      <div
        className={`mt-1 font-bold tabular-nums text-white ${
          value.length > 13 ? "text-lg" : value.length > 10 ? "text-xl" : "text-2xl"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-auto truncate pt-1 text-[11px] text-slate-400" title={sub}>{sub}</div> : null}
    </div>
  );
}

const classeCor: Record<string, string> = {
  A: "bg-emerald-500/20 text-emerald-400",
  B: "bg-amber-500/20 text-amber-400",
  C: "bg-slate-500/20 text-slate-400",
};

export function ComercialClient({ dados, abaInicial }: { dados: DadosComercial; abaInicial?: string }) {
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
  const [aba, setAba] = useState<"faturamento" | "positivacao" | "saude">(
    abaInicial === "saude" ? "saude" : abaInicial === "positivacao" ? "positivacao" : "faturamento",
  );
  // Vendedor expandido (mostra os pedidos para validar contra o Olist).
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="📊 Dashboard Comercial" description="Desempenho de vendas por vendedor, carteira e curva ABC." />

      {/* Abas */}
      <div className="mb-5 flex gap-1 border-b border-white/10">
        {([["faturamento", "Faturamento"], ["positivacao", "Positivação"], ["saude", "Saúde do Comercial"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setAba(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              aba === key ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === "positivacao" ? <PositivacaoPanel positivar={dados.positivar} /> : null}
      {aba === "saude" ? <SaudePanel dados={dados} /> : null}

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
      <div className="mb-5 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Faturamento" value={brl(kpis.faturamento)} sub={`${kpis.pedidos} pedidos`} />
        <Kpi label="Ticket médio" value={brl(kpis.ticketMedio)} />
        <Kpi
          label="Margem de contribuição"
          value={`${kpis.margem.toFixed(1)}%`}
          sub={(() => {
            if (kpis.margemCobertura >= 99.5) return "base: 100% do faturamento";
            // Mostra o motivo real de ficar fora da base (bonificado ≠ sem custo).
            const partes: string[] = [];
            if (kpis.pedidosBonificados > 0) partes.push(`${kpis.pedidosBonificados} bonif.`);
            if (kpis.pedidosSemCusto > 0) partes.push(`${kpis.pedidosSemCusto} s/ custo`);
            if (kpis.pedidosSemItens > 0) partes.push(`${kpis.pedidosSemItens} s/ itens`);
            return `base: ${kpis.margemCobertura.toFixed(0)}%${partes.length ? " · " + partes.join(" · ") : ""}`;
          })()}
        />
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
                  <th className="px-4 py-2 text-right">Margem de contribuição</th>
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
                    <td className={`px-4 py-2 text-right font-semibold ${v.margem >= 18 ? "text-emerald-400" : v.margem >= 0 ? "text-amber-400" : "text-red-400"}`}>
                      {v.margemCobertura > 0 ? `${v.margem.toFixed(1)}%` : <span className="text-slate-500">—</span>}
                      {v.margemCobertura > 0 && v.margemCobertura < 90 ? (
                        <div className="text-[10px] font-normal text-amber-400/80" title="Parte do faturamento não tem custo cadastrado">
                          ⚠ {v.margemCobertura.toFixed(0)}% do fat.
                        </div>
                      ) : null}
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

// ————————————————————————————————————————————————————————————————
// SAÚDE DO COMERCIAL: metas do time interno × externo, quebradas em
// mês/semana/dia, com o quanto já foi realizado no período e uma NOTA
// (realizado ÷ esperado até hoje). INTERNO = Amanda de Castilhos e
// Tainá Evangelista; EXTERNO = todos os demais vendedores.
// Davi Foppa fica FORA dos dois times (não entra nas metas).
const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const VENDEDORES_INTERNOS = ["amanda", "taina"];
const VENDEDORES_FORA_METAS = ["davi foppa"];
const ehInterno = (nome: string) => {
  const n = semAcento(nome);
  return VENDEDORES_INTERNOS.some((v) => n.includes(v));
};
const foraDasMetas = (nome: string) => {
  const n = semAcento(nome);
  return VENDEDORES_FORA_METAS.some((v) => n.includes(v));
};

const METAS_LS = "nyer:metasComercial";

function notaCor(nota: number) {
  return nota >= 9 ? "text-emerald-400" : nota >= 7 ? "text-lime-400" : nota >= 5 ? "text-amber-400" : "text-red-400";
}

function SaudePanel({ dados }: { dados: DadosComercial }) {
  // Sub-aba do time em exibição.
  const [time, setTime] = useState<"interno" | "externo">("interno");
  // Metas MENSAIS editáveis (persistem no navegador).
  const [metaInterno, setMetaInterno] = useState(0);
  const [metaExterno, setMetaExterno] = useState(0);
  useEffect(() => {
    try {
      const j = JSON.parse(localStorage.getItem(METAS_LS) ?? "{}");
      if (Number(j.interno) > 0) setMetaInterno(Number(j.interno));
      if (Number(j.externo) > 0) setMetaExterno(Number(j.externo));
    } catch { /* sem metas salvas */ }
  }, []);
  const salvar = (interno: number, externo: number) => {
    setMetaInterno(interno);
    setMetaExterno(externo);
    try { localStorage.setItem(METAS_LS, JSON.stringify({ interno, externo })); } catch { /* modo privado */ }
  };

  // Calendário do período selecionado (padrão: mês atual até hoje).
  const [y, m] = dados.de.slice(0, 7).split("-").map(Number);
  const diasNoMes = new Date(y, m, 0).getDate();
  const hoje = new Date();
  const mesCorrente = hoje.getFullYear() === y && hoje.getMonth() + 1 === m;
  // Dias já decorridos do mês (se o período é um mês passado, o mês inteiro).
  const diasDecorridos = mesCorrente ? Math.min(hoje.getDate(), diasNoMes) : diasNoMes;

  // Realizado por time (faturamento dos vendedores no período do dashboard).
  const times = useMemo(() => {
    let interno = 0, externo = 0;
    const membrosInterno: string[] = [], membrosExterno: string[] = [];
    for (const v of dados.vendedores) {
      if (foraDasMetas(v.nome)) continue; // Davi Foppa não entra nas metas
      if (ehInterno(v.nome)) { interno += v.faturamento; membrosInterno.push(v.nome); }
      else { externo += v.faturamento; membrosExterno.push(v.nome); }
    }
    return { interno, externo, membrosInterno, membrosExterno };
  }, [dados.vendedores]);

  const linha = (nome: string, emoji: string, meta: number, realizado: number, membros: string[], setMeta: (n: number) => void) => {
    const metaDia = meta / diasNoMes;
    const metaSemana = metaDia * 7;
    const esperadoAteHoje = metaDia * diasDecorridos;
    const pctMes = meta > 0 ? (realizado / meta) * 100 : 0;
    const ritmo = esperadoAteHoje > 0 ? realizado / esperadoAteHoje : 0; // 1 = no ritmo da meta
    const nota = meta > 0 ? Math.min(10, ritmo * 10) : 0;
    const projecao = diasDecorridos > 0 ? (realizado / diasDecorridos) * diasNoMes : 0;
    return (
      <Card key={nome}>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">{emoji} Comercial {nome}</h3>
              <p className="text-[11px] text-slate-400" title={membros.join(", ")}>
                {membros.length} vendedor(es): {membros.join(", ") || "—"}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-400">Meta do mês (R$)</label>
                <input
                  type="number" min={0} step={1000} value={meta || ""}
                  placeholder="ex.: 150000"
                  onChange={(e) => setMeta(Number(e.target.value) || 0)}
                  className="h-9 w-36 rounded-lg border border-white/15 bg-white/5 px-3 text-right text-sm text-white"
                />
              </div>
              {meta > 0 ? (
                <div className="pb-1 text-right">
                  <div className={`text-2xl font-bold tabular-nums ${notaCor(nota)}`}>{nota.toFixed(1)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">nota</div>
                </div>
              ) : null}
            </div>
          </div>

          {meta > 0 ? (
            <>
              {/* Barra de progresso do mês */}
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-slate-300">
                  Realizado <b className="text-white">{brl(realizado)}</b> de <b className="text-white">{brl(meta)}</b>
                </span>
                <span className={`font-semibold ${ritmo >= 1 ? "text-emerald-400" : ritmo >= 0.8 ? "text-amber-400" : "text-red-400"}`}>
                  {pctMes.toFixed(1)}% da meta
                </span>
              </div>
              <div className="relative mb-3 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${ritmo >= 1 ? "bg-emerald-500" : ritmo >= 0.8 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, pctMes)}%` }}
                />
                {/* Marcador de onde a meta DEVERIA estar hoje */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-white/70"
                  style={{ left: `${Math.min(100, (diasDecorridos / diasNoMes) * 100)}%` }}
                  title="Onde a meta deveria estar hoje"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Meta / dia</div>
                  <div className="text-sm font-semibold tabular-nums text-white">{brl(metaDia)}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Meta / semana</div>
                  <div className="text-sm font-semibold tabular-nums text-white">{brl(metaSemana)}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Esperado até hoje</div>
                  <div className="text-sm font-semibold tabular-nums text-white">{brl(esperadoAteHoje)}</div>
                  <div className={`text-[10px] ${realizado >= esperadoAteHoje ? "text-emerald-400" : "text-red-400"}`}>
                    {realizado >= esperadoAteHoje ? "+" : ""}{brl(realizado - esperadoAteHoje)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">Projeção do mês</div>
                  <div className={`text-sm font-semibold tabular-nums ${projecao >= meta ? "text-emerald-400" : "text-white"}`}>{brl(projecao)}</div>
                  <div className="text-[10px] text-slate-500">no ritmo atual</div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Defina a meta do mês acima para acompanhar dia, semana e nota. 💾 Fica salva neste navegador.</p>
          )}
        </CardContent>
      </Card>
    );
  };

  const notaGeral = (() => {
    const notas: number[] = [];
    for (const [meta, real] of [[metaInterno, times.interno], [metaExterno, times.externo]] as const) {
      if (meta <= 0) continue;
      const esperado = (meta / diasNoMes) * diasDecorridos;
      notas.push(esperado > 0 ? Math.min(10, (real / esperado) * 10) : 0);
    }
    return notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-sm text-slate-300">
          <b className="text-white">Saúde do Comercial</b> — período <b className="text-white">{dados.de.split("-").reverse().join("/")}</b> a{" "}
          <b className="text-white">{dados.ate.split("-").reverse().join("/")}</b> · {diasDecorridos}/{diasNoMes} dias do mês.
          A nota compara o realizado com onde a meta deveria estar hoje (10 = no ritmo ou acima).
        </p>
        {notaGeral != null ? (
          <div className="text-right">
            <div className={`text-3xl font-bold tabular-nums ${notaCor(notaGeral)}`}>{notaGeral.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">saúde geral</div>
          </div>
        ) : null}
      </div>

      {/* Sub-abas: um time por vez, mais organizado. */}
      <div className="flex gap-1 border-b border-white/10">
        {([["interno", "🏠 Comercial interno"], ["externo", "🚗 Comercial externo"]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTime(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              time === key ? "border-violet-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {time === "interno"
        ? linha("interno", "🏠", metaInterno, times.interno, times.membrosInterno, (n) => salvar(n, metaExterno))
        : linha("externo", "🚗", metaExterno, times.externo, times.membrosExterno, (n) => salvar(metaInterno, n))}
    </div>
  );
}

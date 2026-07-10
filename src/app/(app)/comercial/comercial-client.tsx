"use client";

import { useRouter } from "next/navigation";
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
  }[];
  abc: { nome: string; receita: number; pctAcum: number; classe: string }[];
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

  return (
    <>
      <PageHeader title="📊 Dashboard Comercial" description="Desempenho de vendas por vendedor, carteira e curva ABC." />

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
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Faturamento" value={brl(kpis.faturamento)} sub={`${kpis.pedidos} pedidos`} />
        <Kpi label="Ticket médio" value={brl(kpis.ticketMedio)} />
        <Kpi label="Margem líquida" value={`${kpis.margem.toFixed(1)}%`} />
        <Kpi label="Positivação" value={`${kpis.positivacao.toFixed(1)}%`} sub={`${kpis.clientesPositivados}/${kpis.carteiraTotal} clientes`} />
        <Kpi label="Clientes ativos" value={String(kpis.clientesPositivados)} sub="no período" />
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
                  <th className="px-4 py-2 text-right">Positivação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {vendedores.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sem vendas no período.</td></tr>
                ) : vendedores.map((v) => (
                  <tr key={v.nome}>
                    <td className="px-4 py-2 font-medium text-white">{v.nome}</td>
                    <td className="px-4 py-2 text-right font-semibold text-white">{brl(v.faturamento)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{v.pedidos}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(v.ticketMedio)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${v.margem >= 26 ? "text-emerald-400" : v.margem >= 0 ? "text-amber-400" : "text-red-400"}`}>
                      {v.margem.toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {v.positivacao.toFixed(0)}% <span className="text-[10px] text-slate-500">({v.clientesPositivados}/{v.carteira})</span>
                    </td>
                  </tr>
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
    </>
  );
}

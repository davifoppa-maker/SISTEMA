"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface NotaFiscal {
  id: string; empresa: string; tipo: "entrada" | "saida"; numero: string | null;
  chave: string | null; data: string | null; cliente: string | null;
  valor: number; vicms: number; vpis: number; vcofins: number; vipi: number;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ContabilClient({ mes, notas, erroTabela }: { mes: string; notas: NotaFiscal[]; erroTabela: string | null }) {
  const router = useRouter();
  const [sync, setSync] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [aba, setAba] = useState<"apuracao" | "saida" | "entrada">("apuracao");

  async function sincronizar() {
    setRodando(true);
    setSync("Buscando notas e XMLs no Olist…");
    try {
      for (const empresa of ["nyer", "ecopro"]) {
        for (let rodada = 0; rodada < 12; rodada++) {
          const r = await fetch(`/api/contabil/sync?mes=${mes}&empresa=${empresa}`, { method: "POST" });
          const j = await r.json();
          if (!r.ok || !j.ok) { setSync(`${empresa}: ${j.error ?? "falha"}`); break; }
          setSync(`${empresa}: ${j.data.jaGravadas + j.data.gravadasAgora}/${j.data.listadas} notas · pendentes ${j.data.pendentes}`);
          if ((j.data.pendentes ?? 0) <= 0) break;
        }
      }
      router.refresh();
    } finally {
      setRodando(false);
    }
  }

  const ent = useMemo(() => notas.filter((n) => n.tipo === "entrada"), [notas]);
  const sai = useMemo(() => notas.filter((n) => n.tipo === "saida"), [notas]);
  const soma = (arr: NotaFiscal[], k: keyof NotaFiscal) => arr.reduce((s, n) => s + (Number(n[k]) || 0), 0);

  const icmsDeb = soma(sai, "vicms"), icmsCred = soma(ent, "vicms"), icmsSaldo = icmsDeb - icmsCred;
  const pisDeb = soma(sai, "vpis"), pisCred = soma(ent, "vpis");
  const cofDeb = soma(sai, "vcofins"), cofCred = soma(ent, "vcofins");

  function mudaMes(delta: number) {
    const [a, m] = mes.split("-").map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    const novo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    window.location.href = `/contabil?mes=${novo}`;
  }

  const Tabela = ({ lista }: { lista: NotaFiscal[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-slate-400">
            <th className="px-3 py-2">Data</th><th className="px-3 py-2">NF</th><th className="px-3 py-2">Cliente/Fornecedor</th>
            <th className="px-3 py-2">Emp.</th><th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-right">ICMS</th><th className="px-3 py-2 text-right">PIS</th><th className="px-3 py-2 text-right">COFINS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {lista.map((n) => (
            <tr key={n.id}>
              <td className="px-3 py-1.5 text-slate-400">{n.data ? n.data.split("-").reverse().join("/") : "—"}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-slate-300">{n.numero}</td>
              <td className="px-3 py-1.5 text-slate-200">{n.cliente ?? "—"}</td>
              <td className="px-3 py-1.5 text-xs text-slate-500">{n.empresa}</td>
              <td className="px-3 py-1.5 text-right font-medium text-white">{brl(n.valor)}</td>
              <td className="px-3 py-1.5 text-right text-slate-300">{brl(n.vicms)}</td>
              <td className="px-3 py-1.5 text-right text-slate-300">{brl(n.vpis)}</td>
              <td className="px-3 py-1.5 text-right text-slate-300">{brl(n.vcofins)}</td>
            </tr>
          ))}
          {lista.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">Nenhuma nota — clique em Sincronizar.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {erroTabela ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          ⚠ Tabela fiscal_notes ainda não existe no banco ({erroTabela}). Rode o SQL de criação (te passei no chat) no Supabase → SQL Editor.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => mudaMes(-1)}>←</Button>
        <span className="text-sm font-bold text-white">{mes.split("-").reverse().join("/")}</span>
        <Button size="sm" variant="secondary" onClick={() => mudaMes(1)}>→</Button>
        <Button size="sm" onClick={sincronizar} disabled={rodando}>
          {rodando ? "Sincronizando…" : "⬇ Sincronizar notas do Olist"}
        </Button>
        {sync ? <span className="text-xs text-slate-400">{sync}</span> : null}
      </div>

      {/* APURAÇÃO */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className={icmsSaldo >= 0 ? "border-red-500/40" : "border-emerald-500/40"}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-400">ICMS do mês</p>
            <p className={`text-2xl font-bold ${icmsSaldo >= 0 ? "text-red-400" : "text-emerald-400"}`}>
              {icmsSaldo >= 0 ? `a recolher ${brl(icmsSaldo)}` : `crédito ${brl(-icmsSaldo)}`}
            </p>
            <p className="text-xs text-slate-500">débito (saídas) {brl(icmsDeb)} − crédito (entradas) {brl(icmsCred)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-400">PIS</p>
            <p className="text-2xl font-bold text-white">{brl(pisDeb - pisCred)}</p>
            <p className="text-xs text-slate-500">saídas {brl(pisDeb)} − entradas {brl(pisCred)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs font-medium uppercase text-slate-400">COFINS</p>
            <p className="text-2xl font-bold text-white">{brl(cofDeb - cofCred)}</p>
            <p className="text-xs text-slate-500">saídas {brl(cofDeb)} − entradas {brl(cofCred)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-white/10">
        {([["apuracao", `Resumo`], ["saida", `Saídas (${sai.length})`], ["entrada", `Entradas (${ent.length})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-4 py-2 text-sm font-medium ${aba === k ? "border-b-2 border-amber-400 text-white" : "text-slate-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {aba === "apuracao" ? (
        <Card><CardContent className="pt-4 text-sm leading-relaxed text-slate-300">
          <p><b className="text-white">Como ler:</b> o ICMS destacado nas <b>saídas</b> é débito; o das <b>entradas</b> (compras de insumos/mercadorias) gera crédito. Saldo positivo = ICMS a recolher no mês; negativo = crédito acumulado que compensa meses seguintes.</p>
          <p className="mt-2 text-xs text-slate-500">⚠ Números extraídos do XML das NFs (bloco ICMSTot). A apuração oficial é do contador — use esta tela como gestão/conferência, não como guia de recolhimento.</p>
        </CardContent></Card>
      ) : aba === "saida" ? (
        <Card><CardContent className="p-0"><Tabela lista={sai} /></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><Tabela lista={ent} /></CardContent></Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ItemFalta { sku: string | null; nome: string; qtd: number }
interface LinhaCompra { sku: string; descricao: string; necessario: number; emEstoque: number | null; comprar: number | null }

// Necessidade de COMPRA de matéria-prima: explode a engenharia (Olist) dos
// produtos em falta e cruza com o estoque de insumos do balanço.
export function ComprasMateriaPrima({ itens }: { itens: ItemFalta[] }) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<{
    linhas: LinhaCompra[];
    explodidos: { sku: string; nome: string; unidades: number }[];
    semEngenharia: { sku: string; nome: string }[];
    estoqueErro: string | null;
  } | null>(null);

  async function calcular() {
    setLoading(true);
    setErro(null);
    try {
      const r = await fetch("/api/producao/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Falha ao calcular.");
      setDados(j.data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao calcular.");
    } finally {
      setLoading(false);
    }
  }

  const faltando = dados?.linhas.filter((l) => (l.comprar ?? 0) > 0) ?? [];

  return (
    <Card className="no-print mt-4">
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-white">🛒 Necessidade de compra (matéria-prima)</p>
            <p className="text-xs text-slate-500">
              Explode a engenharia (Olist) dos {itens.length} produto(s) em falta e cruza com o estoque de insumos do balanço.
            </p>
          </div>
          <Button size="sm" onClick={calcular} disabled={loading || itens.length === 0}>
            {loading ? "Calculando… (pode levar ~30s)" : "Calcular compras"}
          </Button>
        </div>
        {erro ? <p className="text-sm text-amber-400">{erro}</p> : null}

        {dados ? (
          <>
            {faltando.length > 0 ? (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300">
                🚨 FALTA MATÉRIA-PRIMA: {faltando.length} insumo(s) abaixo do necessário — ver coluna “Comprar”.
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300">
                ✅ Estoque de insumos cobre a produção necessária.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                    <th className="px-3 py-2">Insumo</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Necessário</th>
                    <th className="px-3 py-2 text-right">Em estoque</th>
                    <th className="px-3 py-2 text-right">Comprar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dados.linhas.map((l) => (
                    <tr key={l.sku} className={(l.comprar ?? 0) > 0 ? "bg-red-500/5" : ""}>
                      <td className="px-3 py-1.5 text-slate-100">{l.descricao}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{l.sku}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{l.necessario.toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-1.5 text-right text-slate-300">{l.emEstoque != null ? l.emEstoque.toLocaleString("pt-BR") : "não achado no balanço"}</td>
                      <td className={`px-3 py-1.5 text-right font-bold ${(l.comprar ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {l.comprar != null ? (l.comprar > 0 ? l.comprar.toLocaleString("pt-BR") : "0") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">
              Base: {dados.explodidos.length} produto(s) com engenharia
              {dados.semEngenharia.length > 0 ? ` · ⚠ sem engenharia no Olist: ${dados.semEngenharia.map((s) => s.nome).slice(0, 6).join(", ")}${dados.semEngenharia.length > 6 ? "…" : ""}` : ""}
              {dados.estoqueErro ? ` · ⚠ balanço: ${dados.estoqueErro}` : ""}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

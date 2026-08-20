"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface ProdutoCaixa {
  sku: string;
  produto: string;
  medidaProduto: string;
  caixa: string;
  tipo: "master" | "padrao" | "digital" | "grande";
  medidaCaixa: string;
}

const TIPO_LABEL: Record<ProdutoCaixa["tipo"], string> = {
  master: "Caixa máster (produto já vem fechado)",
  padrao: "Caixa padrão da expedição",
  digital: "Digital — não vai em caixa",
  grande: "Fora do padrão — conferir",
};

export function GuiaCaixasClient({
  produtos,
  catalogoCaixas,
}: {
  produtos: ProdutoCaixa[];
  catalogoCaixas: { nome: string; medidas: string }[];
}) {
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = q
      ? produtos.filter((p) => p.produto.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : produtos;
    return [...lista].sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR", { sensitivity: "base" }));
  }, [produtos, busca]);

  // Agrupado por caixa (para a visão "quais produtos vão em cada caixa").
  const porCaixa = useMemo(() => {
    const mapa = new Map<string, { caixa: string; medidas: string; tipo: ProdutoCaixa["tipo"]; itens: ProdutoCaixa[] }>();
    for (const p of visiveis) {
      const e = mapa.get(p.caixa) ?? { caixa: p.caixa, medidas: p.medidaCaixa, tipo: p.tipo, itens: [] };
      e.itens.push(p);
      mapa.set(p.caixa, e);
    }
    return [...mapa.values()].sort((a, b) => b.itens.length - a.itens.length);
  }, [visiveis]);

  return (
    <div className="space-y-4">
      {/* Catálogo de caixas padrão */}
      <Card>
        <CardContent className="pt-4">
          <p className="mb-2 text-sm font-semibold text-white">Caixas padrão da expedição (C×L×A, medidas internas)</p>
          <div className="flex flex-wrap gap-2">
            {catalogoCaixas.map((c) => (
              <span key={c.nome} className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                <b className="text-white">{c.nome}</b> · {c.medidas}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Input
        placeholder="🔎 Buscar produto ou SKU… (ex.: hydro, refil, creatina)"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-md"
      />

      {/* Agrupado por caixa */}
      {porCaixa.map((g) => (
        <Card key={g.caixa}>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-baseline gap-2 border-b border-white/10 px-4 py-3">
              <span className="text-sm font-bold text-white">📦 {g.caixa}</span>
              <span className="text-xs text-slate-400">{g.medidas} · {TIPO_LABEL[g.tipo]} · {g.itens.length} produto(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/5">
                  {g.itens.map((p) => (
                    <tr key={p.sku}>
                      <td className="px-4 py-1.5 text-slate-100">{p.produto}</td>
                      <td className="px-4 py-1.5 font-mono text-xs text-slate-400">{p.sku}</td>
                      <td className="px-4 py-1.5 text-right text-xs text-slate-400">{p.medidaProduto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
      {visiveis.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum produto encontrado para “{busca}”.</p>
      ) : null}
    </div>
  );
}

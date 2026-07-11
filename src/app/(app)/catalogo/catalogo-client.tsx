"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/product-costs";

const TIPOS: { value: Product["type"]; label: string }[] = [
  { value: "proteico", label: "Proteico" },
  { value: "nao_proteico", label: "Não-proteico" },
  { value: "acessorio", label: "Acessório" },
];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CatalogoClient({ produtos }: { produtos: Product[] }) {
  const [rows, setRows] = useState<Product[]>(produtos);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // SKUs alterados (para salvar só o que mudou).
  const [alterados, setAlterados] = useState<Set<string>>(new Set());

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
  }, [rows, busca]);

  function update(sku: string, patch: Partial<Product>) {
    setRows((prev) => prev.map((p) => (p.sku === sku ? { ...p, ...patch } : p)));
    setAlterados((prev) => new Set(prev).add(sku));
  }

  function addNovo() {
    const novo: Product = { sku: "", name: "", tabela: 0, cost: 0, type: "proteico" };
    setRows((prev) => [novo, ...prev]);
  }

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const paraSalvar = rows.filter((p) => p.sku.trim() && (alterados.has(p.sku) || !produtos.find((o) => o.sku === p.sku)));
    if (paraSalvar.length === 0) {
      setMsg({ ok: false, text: "Nenhuma alteração para salvar." });
      setSalvando(false);
      return;
    }
    try {
      const res = await fetch("/api/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paraSalvar),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: `${json.data.salvos} produto(s) salvo(s)! As mudanças já valem no Gestor de Margem.` });
        setAlterados(new Set());
      } else {
        setMsg({ ok: false, text: json.error ?? "Falha ao salvar." });
      }
    } catch {
      setMsg({ ok: false, text: "Falha de rede ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <PageHeader title="Custos & Preços (Gestor de Margem)" description="Edite o custo e o preço de tabela de cada produto. Só o admin acessa.">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={addNovo}>+ Novo produto</Button>
          <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </PageHeader>

      {msg ? (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {msg.text}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-3 pt-4">
          <Input placeholder="🔎 Buscar por nome ou SKU…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-2 py-2">Produto</th>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Custo (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((p, i) => {
                  return (
                    <tr key={p.sku || `novo-${i}`}>
                      <td className="px-2 py-1.5">
                        <Input value={p.name} onChange={(e) => update(p.sku, { name: e.target.value })} className="min-w-[220px]" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={p.sku} onChange={(e) => update(p.sku, { sku: e.target.value })} className="w-28 font-mono text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.type}
                          onChange={(e) => update(p.sku, { type: e.target.value as Product["type"] })}
                          className="h-9 rounded-lg border border-slate-300 bg-transparent px-2 text-sm"
                        >
                          {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Input
                          type="number" step="0.01" value={String(p.cost)}
                          onChange={(e) => update(p.sku, { cost: Number(e.target.value) || 0 })}
                          className="w-24 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

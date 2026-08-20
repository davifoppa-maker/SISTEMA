"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Insumo { sku: string | null; descricao: string; qtdLote: number; qtdPorUnidade: number }
interface Engenharia { produto: { sku?: string; descricao?: string }; unidadesLote: number; insumos: Insumo[] }

const PRODUTOS_SUGERIDOS = [
  { rotulo: "Hydro Protein 820g", sku: "NYER260430" },
  { rotulo: "Milk", busca: "milk" },
  { rotulo: "Beef", busca: "beef" },
];

const LS_PRECOS = "nyer:precosInsumos";      // { [skuInsumo]: precoUnit }
const LS_SIMULADOR = "nyer:simuladorCustos"; // parâmetros do simulador

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CalculadoraClient() {
  const [skuBusca, setSkuBusca] = useState("NYER260430");
  const [eng, setEng] = useState<Engenharia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preços dos insumos (R$ pela unidade da engenharia: kg p/ pós, un p/ pouch).
  const [precos, setPrecos] = useState<Record<string, string>>({});
  const [perdaPct, setPerdaPct] = useState("3");       // perda típica do lote
  const [outrosUnit, setOutrosUnit] = useState("0");   // mão de obra/energia por unidade

  // Simulador de venda.
  const [precoVenda, setPrecoVenda] = useState("");
  const [impostoPct, setImpostoPct] = useState("12");
  const [cartaoPct, setCartaoPct] = useState("4");
  const [comissaoPct, setComissaoPct] = useState("0");
  const [fixoPct, setFixoPct] = useState("0");
  const [fretePorUnid, setFretePorUnid] = useState("0");
  const [margemAlvo, setMargemAlvo] = useState("25");

  // Carrega/salva estado no navegador (preços do mês + parâmetros).
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PRECOS) ?? "{}");
      if (p && typeof p === "object") setPrecos(p);
      const s = JSON.parse(localStorage.getItem(LS_SIMULADOR) ?? "{}");
      if (s.impostoPct) setImpostoPct(s.impostoPct);
      if (s.cartaoPct) setCartaoPct(s.cartaoPct);
      if (s.comissaoPct) setComissaoPct(s.comissaoPct);
      if (s.fixoPct) setFixoPct(s.fixoPct);
      if (s.perdaPct) setPerdaPct(s.perdaPct);
      if (s.margemAlvo) setMargemAlvo(s.margemAlvo);
    } catch { /* primeira visita */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_PRECOS, JSON.stringify(precos)); } catch { /* cheio */ }
  }, [precos]);
  useEffect(() => {
    try { localStorage.setItem(LS_SIMULADOR, JSON.stringify({ impostoPct, cartaoPct, comissaoPct, fixoPct, perdaPct, margemAlvo })); } catch { /* */ }
  }, [impostoPct, cartaoPct, comissaoPct, fixoPct, perdaPct, margemAlvo]);

  async function carregar(q: { sku?: string; busca?: string }) {
    setCarregando(true);
    setErro(null);
    try {
      const qs = q.sku ? `sku=${encodeURIComponent(q.sku)}` : `busca=${encodeURIComponent(q.busca ?? "")}`;
      const r = await fetch(`/api/engenharia?${qs}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Falha ao buscar engenharia.");
      setEng(j.data);
    } catch (e) {
      setEng(null);
      setErro(e instanceof Error ? e.message : "Erro ao buscar engenharia.");
    } finally {
      setCarregando(false);
    }
  }

  // Custo do produto: Σ (qtd/un × preço) × (1 + perda) + outros custos unitários.
  const custo = useMemo(() => {
    if (!eng) return null;
    let materiais = 0;
    let semPreco = 0;
    for (const i of eng.insumos) {
      const p = num(precos[i.sku ?? i.descricao] ?? "");
      if (p <= 0) semPreco++;
      materiais += i.qtdPorUnidade * p;
    }
    const comPerda = materiais * (1 + num(perdaPct) / 100);
    const total = comPerda + num(outrosUnit);
    return { materiais, comPerda, total, semPreco };
  }, [eng, precos, perdaPct, outrosUnit]);

  // Simulador: vendendo a X → o que sai e o que sobra.
  const sim = useMemo(() => {
    const preco = num(precoVenda);
    if (!preco || !custo) return null;
    const imposto = preco * (num(impostoPct) / 100);
    const cartao = preco * (num(cartaoPct) / 100);
    const comissao = preco * (num(comissaoPct) / 100);
    const fixo = preco * (num(fixoPct) / 100);
    const frete = num(fretePorUnid);
    const lucro = preco - imposto - cartao - comissao - fixo - frete - custo.total;
    const margem = (lucro / preco) * 100;
    return { preco, imposto, cartao, comissao, fixo, frete, lucro, margem };
  }, [precoVenda, impostoPct, cartaoPct, comissaoPct, fixoPct, fretePorUnid, custo]);

  // Preço mínimo para a margem alvo: preço = (custo+frete) / (1 - %taxas - %alvo).
  const precoAlvo = useMemo(() => {
    if (!custo) return null;
    const taxas = (num(impostoPct) + num(cartaoPct) + num(comissaoPct) + num(fixoPct)) / 100;
    const alvo = num(margemAlvo) / 100;
    const denom = 1 - taxas - alvo;
    if (denom <= 0) return null;
    return (custo.total + num(fretePorUnid)) / denom;
  }, [custo, impostoPct, cartaoPct, comissaoPct, fixoPct, fretePorUnid, margemAlvo]);

  return (
    <div className="space-y-4">
      {/* Seleção do produto */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {PRODUTOS_SUGERIDOS.map((p) => (
              <Button key={p.rotulo} size="sm" variant="secondary" onClick={() => carregar(p)}>
                {p.rotulo}
              </Button>
            ))}
            <Input
              value={skuBusca}
              onChange={(e) => setSkuBusca(e.target.value)}
              placeholder="SKU ou nome do produto…"
              className="w-56"
            />
            <Button size="sm" onClick={() => carregar(skuBusca.includes(" ") ? { busca: skuBusca } : { sku: skuBusca })} disabled={carregando}>
              {carregando ? "Buscando…" : "Carregar engenharia"}
            </Button>
          </div>
          {erro ? <p className="text-sm text-amber-400">{erro}</p> : null}
          <p className="text-xs text-slate-500">
            A engenharia vem do Olist em tempo real. Os preços dos insumos ficam salvos neste navegador — atualize-os mensalmente.
          </p>
        </CardContent>
      </Card>

      {eng ? (
        <>
          {/* Engenharia + preços dos insumos */}
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-3">
                <span className="text-sm font-bold text-white">🏭 {eng.produto.descricao}</span>
                <span className="text-xs text-slate-400">Lote de {eng.unidadesLote} unidades · consumo por unidade abaixo</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                      <th className="px-4 py-2">Insumo</th>
                      <th className="px-4 py-2 text-right">Qtd/lote</th>
                      <th className="px-4 py-2 text-right">Qtd/unidade</th>
                      <th className="px-4 py-2 text-right">Preço do insumo (R$)</th>
                      <th className="px-4 py-2 text-right">Custo/unidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {eng.insumos.map((i) => {
                      const key = i.sku ?? i.descricao;
                      const p = num(precos[key] ?? "");
                      return (
                        <tr key={key} className={p <= 0 ? "bg-amber-500/5" : ""}>
                          <td className="px-4 py-1.5 text-slate-100">{i.descricao} <span className="font-mono text-[10px] text-slate-500">{i.sku}</span></td>
                          <td className="px-4 py-1.5 text-right text-slate-400">{i.qtdLote}</td>
                          <td className="px-4 py-1.5 text-right text-slate-300">{i.qtdPorUnidade}</td>
                          <td className="px-4 py-1.5 text-right">
                            <Input
                              value={precos[key] ?? ""}
                              onChange={(e) => setPrecos((prev) => ({ ...prev, [key]: e.target.value }))}
                              inputMode="decimal"
                              placeholder="0,00"
                              className={`ml-auto w-24 text-right ${p <= 0 ? "border-amber-400" : ""}`}
                            />
                          </td>
                          <td className="px-4 py-1.5 text-right font-medium text-slate-200">{p > 0 ? brl(i.qtdPorUnidade * p) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end gap-4 border-t border-white/10 px-4 py-3">
                <label className="text-xs text-slate-400">Perda do lote (%)
                  <Input value={perdaPct} onChange={(e) => setPerdaPct(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                <label className="text-xs text-slate-400">Outros custos/un (mão de obra, energia…)
                  <Input value={outrosUnit} onChange={(e) => setOutrosUnit(e.target.value)} inputMode="decimal" className="mt-1 w-24" />
                </label>
                {custo ? (
                  <div className="ml-auto text-right">
                    {custo.semPreco > 0 ? (
                      <p className="text-xs text-amber-400">⚠ {custo.semPreco} insumo(s) sem preço — custo parcial</p>
                    ) : null}
                    <p className="text-xs text-slate-400">Materiais {brl(custo.materiais)} + perda = {brl(custo.comPerda)}</p>
                    <p className="text-lg font-bold text-white">Custo por unidade: <span className="text-emerald-400">{brl(custo.total)}</span></p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Simulador de venda */}
          <Card>
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-bold text-white">💰 Simulador: vendendo a…</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <label className="text-xs text-slate-400">Preço de venda (R$)
                  <Input value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Imposto (%)
                  <Input value={impostoPct} onChange={(e) => setImpostoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Cartão/gateway (%)
                  <Input value={cartaoPct} onChange={(e) => setCartaoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Comissão (%)
                  <Input value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Custo fixo (%)
                  <Input value={fixoPct} onChange={(e) => setFixoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Frete por unid. (R$)
                  <Input value={fretePorUnid} onChange={(e) => setFretePorUnid(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
              </div>

              {sim ? (
                <div className="overflow-x-auto">
                  <table className="w-full max-w-xl text-sm">
                    <tbody className="divide-y divide-white/5">
                      <tr><td className="py-1.5 text-slate-300">Preço de venda</td><td className="py-1.5 text-right font-medium text-white">{brl(sim.preco)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Imposto ({impostoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(sim.imposto)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Cartão ({cartaoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(sim.cartao)}</td></tr>
                      {num(comissaoPct) > 0 ? <tr><td className="py-1.5 text-slate-400">− Comissão ({comissaoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(sim.comissao)}</td></tr> : null}
                      {num(fixoPct) > 0 ? <tr><td className="py-1.5 text-slate-400">− Custo fixo ({fixoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(sim.fixo)}</td></tr> : null}
                      {sim.frete > 0 ? <tr><td className="py-1.5 text-slate-400">− Frete</td><td className="py-1.5 text-right text-red-400">−{brl(sim.frete)}</td></tr> : null}
                      <tr><td className="py-1.5 text-slate-400">− Custo do produto (engenharia)</td><td className="py-1.5 text-right text-red-400">−{brl(custo!.total)}</td></tr>
                      <tr className="border-t border-white/20">
                        <td className="py-2 font-bold text-white">Lucro por unidade</td>
                        <td className={`py-2 text-right text-lg font-bold ${sim.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(sim.lucro)} <span className="text-sm">({sim.margem.toFixed(1)}%)</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Preencha o preço de venda para simular.</p>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
                <label className="text-xs text-slate-400">Margem alvo (%)
                  <Input value={margemAlvo} onChange={(e) => setMargemAlvo(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                {precoAlvo != null ? (
                  <p className="text-sm text-slate-200">→ Preço mínimo para {margemAlvo}% de margem: <b className="text-emerald-400">{brl(precoAlvo)}</b></p>
                ) : (
                  <p className="text-xs text-amber-400">Taxas + margem alvo passam de 100% — impossível.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

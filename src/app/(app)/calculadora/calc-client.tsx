"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Insumo { sku: string | null; descricao: string; qtdLote: number; qtdPorUnidade: number; custoOlist: number | null }
interface Engenharia { produto: { sku?: string; descricao?: string }; unidadesLote: number; insumos: Insumo[] }


const LS_PRECOS = "nyer:precosInsumos";
const LS_SIMULADOR = "nyer:simuladorCustos2";

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CalculadoraClient() {
  const [sabores, setSabores] = useState<{ sku: string; descricao: string }[]>([]);
  const [buscandoSabores, setBuscandoSabores] = useState(false);
  const [eng, setEng] = useState<Engenharia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preços dos insumos: o Olist preenche; edição manual sobrepõe (salva local).
  const [precos, setPrecos] = useState<Record<string, string>>({});
  // Rendimento do lote/batida (unidades). Inferido da engenharia; EDITÁVEL —
  // engenharias sem a linha de embalagem (ex.: Beef) vêm por batida e o
  // rendimento precisa ser informado. Salvo por produto.
  const [unidadesLote, setUnidadesLote] = useState("1");
  const [lotesSalvos, setLotesSalvos] = useState<Record<string, string>>({});
  const [perdaPct, setPerdaPct] = useState("3");
  const [caixaUnit, setCaixaUnit] = useState("0,90"); // caixa por produto
  const [fitaUnit, setFitaUnit] = useState("0,10");   // fita por produto
  const [outrosUnit, setOutrosUnit] = useState("0");  // mão de obra/energia etc.

  // Simulador — defaults da operação (tudo editável, flutua).
  const [precoVenda, setPrecoVenda] = useState("");
  const [impostoPct, setImpostoPct] = useState("21,5"); // débito na venda
  const [creditoPct, setCreditoPct] = useState("20,5"); // crédito sobre a COMPRA dos insumos
  const [fixoUnit, setFixoUnit] = useState("3,50"); // R$ por unidade (flutua)
  const [temComissao, setTemComissao] = useState(true);
  const [meiaNota, setMeiaNota] = useState(false); // imposto sobre 50% do faturamento; frete 4%
  const [comissaoPct, setComissaoPct] = useState("5");
  const [fretePct, setFretePct] = useState("5");        // % do faturamento (meia nota: 4%)
  const [cartaoVistaPct, setCartaoVistaPct] = useState("1,61");
  const [cartao4xPct, setCartao4xPct] = useState("4,03"); // 1,61%/mês × prazo médio 2,5 meses
  const [margemAlvo, setMargemAlvo] = useState("25");

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(LS_PRECOS) ?? "{}");
      if (p && typeof p === "object") setPrecos(p);
      const lu = JSON.parse(localStorage.getItem("nyer:lotesProdutos") ?? "{}");
      if (lu && typeof lu === "object") setLotesSalvos(lu);
      const s = JSON.parse(localStorage.getItem(LS_SIMULADOR) ?? "{}");
      for (const [k, setter] of Object.entries({
        impostoPct: setImpostoPct, creditoPct: setCreditoPct, fixoUnit: setFixoUnit, comissaoPct: setComissaoPct,
        fretePct: setFretePct, cartaoVistaPct: setCartaoVistaPct, cartao4xPct: setCartao4xPct,
        perdaPct: setPerdaPct, margemAlvo: setMargemAlvo, caixaUnit: setCaixaUnit, fitaUnit: setFitaUnit,
      } as Record<string, (v: string) => void>)) {
        if (s[k]) setter(s[k]);
      }
      if (typeof s.temComissao === "boolean") setTemComissao(s.temComissao);
      if (typeof s.meiaNota === "boolean") setMeiaNota(s.meiaNota);
    } catch { /* primeira visita */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_PRECOS, JSON.stringify(precos)); } catch { /* */ }
  }, [precos]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_SIMULADOR, JSON.stringify({
        impostoPct, creditoPct, fixoUnit, comissaoPct, fretePct, cartaoVistaPct, cartao4xPct,
        perdaPct, margemAlvo, caixaUnit, fitaUnit, temComissao, meiaNota,
      }));
    } catch { /* */ }
  }, [impostoPct, creditoPct, fixoUnit, comissaoPct, fretePct, cartaoVistaPct, cartao4xPct, perdaPct, margemAlvo, caixaUnit, fitaUnit, temComissao, meiaNota]);

  // Lista TODOS os produtos com engenharia. Cache duplo: navegador (30 min,
  // abre instantâneo) + servidor (30 min). Carrega SOZINHA ao abrir a página.
  async function listarTodos(forcar = false) {
    if (!forcar) {
      try {
        const c = JSON.parse(localStorage.getItem("nyer:engProdutos3") ?? "null");
        if (c && c.exp > Date.now() && Array.isArray(c.sabores) && c.sabores.length > 0) {
          setSabores(c.sabores);
          return;
        }
      } catch { /* sem cache */ }
    }
    setBuscandoSabores(true);
    setErro(null);
    try {
      const r = await fetch("/api/engenharia?todas=1");
      if (r.status === 504) throw new Error("A varredura demorou demais (tempo do servidor). Clica no ↻ para tentar de novo — a segunda tentativa aproveita o cache e é mais rápida.");
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `Falha ao listar (HTTP ${r.status}).`);
      const achados = j.data.sabores ?? [];
      setSabores(achados);
      if (achados.length > 0) {
        try { localStorage.setItem("nyer:engProdutos3", JSON.stringify({ sabores: achados, exp: Date.now() + 30 * 60 * 1000 })); } catch { /* */ }
      } else setErro("Nenhum produto com engenharia encontrado no Olist.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao listar.");
    } finally {
      setBuscandoSabores(false);
    }
  }

  // Carrega a lista automaticamente ao abrir a calculadora.
  useEffect(() => {
    listarTodos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar(q: { sku?: string; busca?: string }): Promise<boolean> {
    setCarregando(true);
    setErro(null);
    try {
      const qs = q.sku ? `sku=${encodeURIComponent(q.sku)}` : `busca=${encodeURIComponent(q.busca ?? "")}`;
      const r = await fetch(`/api/engenharia?${qs}`);
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Falha ao buscar engenharia.");
      const dados: Engenharia = j.data;
      setEng(dados);
      const skuProd = dados.produto.sku ?? "";
      setUnidadesLote(lotesSalvos[skuProd] ?? String(dados.unidadesLote));
      // Custos do Olist preenchem o que estiver vazio (manual tem prioridade).
      setPrecos((prev) => {
        const novo = { ...prev };
        for (const i of dados.insumos) {
          const k = i.sku ?? i.descricao;
          if (!novo[k] && i.custoOlist != null) novo[k] = String(i.custoOlist).replace(".", ",");
        }
        return novo;
      });
      return true;
    } catch (e) {
      setEng(null);
      setErro(e instanceof Error ? e.message : "Erro ao buscar engenharia.");
      return false;
    } finally {
      setCarregando(false);
    }
  }

  function mudarLote(v: string) {
    setUnidadesLote(v);
    const skuProd = eng?.produto.sku ?? "";
    if (skuProd) {
      setLotesSalvos((prev) => {
        const novo = { ...prev, [skuProd]: v };
        try { localStorage.setItem("nyer:lotesProdutos", JSON.stringify(novo)); } catch { /* */ }
        return novo;
      });
    }
  }

  // Consumo por unidade recalculado com o rendimento EDITÁVEL do lote.
  // EXCEÇÃO: itens de EMBALAGEM (rótulo/sleeve/pouch/colher/tampa...) que o
  // Olist cadastra JÁ POR UNIDADE (qtd pequena, ex.: 1 rótulo) não são diluídos
  // — senão 1 rótulo virava 1/270 (R$ 0,01 em vez de R$ 3,00).
  const EMBALAGEM_RE = /r[oó]tulo|sleeve|pouch|tampa|colher|dosador|selo|lacre|caixa|sachê|sache/i;
  const porUnidade = (i: Insumo): number => {
    const un = Math.max(num(unidadesLote), 1);
    const ehEmbalagem = EMBALAGEM_RE.test(i.descricao) || /^(EMB|RTL)/i.test(i.sku ?? "");
    // Embalagem com quantidade MENOR que meia batida = cadastrada por unidade.
    if (ehEmbalagem && i.qtdLote > 0 && i.qtdLote < un / 2) return i.qtdLote;
    return i.qtdLote / un;
  };

  function usarCustosOlist() {
    if (!eng) return;
    setPrecos((prev) => {
      const novo = { ...prev };
      for (const i of eng.insumos) {
        if (i.custoOlist != null) novo[i.sku ?? i.descricao] = String(i.custoOlist).replace(".", ",");
      }
      return novo;
    });
  }

  const custo = useMemo(() => {
    if (!eng) return null;
    let materiais = 0;
    let semPreco = 0;
    for (const i of eng.insumos) {
      const p = num(precos[i.sku ?? i.descricao] ?? "");
      if (p <= 0) semPreco++;
      materiais += porUnidade(i) * p;
    }
    const comPerda = materiais * (1 + num(perdaPct) / 100);
    const embalagem = num(caixaUnit) + num(fitaUnit);
    const total = comPerda + embalagem + num(outrosUnit);
    return { materiais, comPerda, embalagem, total, semPreco };
  }, [eng, precos, perdaPct, caixaUnit, fitaUnit, outrosUnit, unidadesLote]);

  // Simula um cenário (dada a taxa de cartão).
  function simula(cartaoPct: number) {
    const preco = num(precoVenda);
    if (!preco || !custo) return null;
    const impostoDebito = preco * (num(impostoPct) / 100) * (meiaNota ? 0.5 : 1);
    // CRÉDITO tributário sobre os MATERIAIS (insumos puros, sem perda/embalagem).
    const credito = custo.materiais * (num(creditoPct) / 100);
    const imposto = impostoDebito - credito; // imposto líquido
    const cartao = preco * (cartaoPct / 100);
    const comissao = temComissao ? preco * (num(comissaoPct) / 100) : 0;
    const fixo = num(fixoUnit); // R$ por unidade
    const frete = preco * (num(fretePct) / 100);
    const lucro = preco - imposto - cartao - comissao - fixo - frete - custo.total;
    return { impostoDebito, credito, imposto, cartao, comissao, fixo, frete, lucro, margem: (lucro / preco) * 100 };
  }
  const simVista = useMemo(() => simula(num(cartaoVistaPct)), [precoVenda, impostoPct, creditoPct, cartaoVistaPct, comissaoPct, temComissao, meiaNota, fixoUnit, fretePct, custo]);
  const sim4x = useMemo(() => simula(num(cartao4xPct)), [precoVenda, impostoPct, creditoPct, cartao4xPct, comissaoPct, temComissao, meiaNota, fixoUnit, fretePct, custo]);

  // Preço mínimo p/ margem alvo (arredondado p/ cima em 0,10).
  function alvo(cartaoPct: number): number | null {
    if (!custo) return null;
    const taxas = (num(impostoPct) * (meiaNota ? 0.5 : 1) + cartaoPct + (temComissao ? num(comissaoPct) : 0) + num(fretePct)) / 100;
    const denom = 1 - taxas - num(margemAlvo) / 100;
    if (denom <= 0) return null;
    const credito = custo.materiais * (num(creditoPct) / 100);
    return Math.ceil(((custo.total + num(fixoUnit) - credito) / denom) * 10) / 10;
  }
  const alvoVista = useMemo(() => alvo(num(cartaoVistaPct)), [custo, impostoPct, creditoPct, cartaoVistaPct, comissaoPct, temComissao, meiaNota, fixoUnit, fretePct, margemAlvo]);
  const alvo4x = useMemo(() => alvo(num(cartao4xPct)), [custo, impostoPct, creditoPct, cartao4xPct, comissaoPct, temComissao, meiaNota, fixoUnit, fretePct, margemAlvo]);

  return (
    <div className="space-y-4">
      {/* Produto */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-400">
              Produto (com engenharia no Olist)
              <select
                defaultValue=""
                onChange={(e) => { if (e.target.value) carregar({ sku: e.target.value }); }}
                className="mt-1 block h-10 min-w-[320px] rounded-lg border border-violet-500/50 bg-white/5 px-2 text-sm text-white"
              >
                <option value="">{buscandoSabores ? "carregando produtos…" : `— escolher (${sabores.length}) —`}</option>
                {sabores.map((sb) => (
                  <option key={sb.sku} value={sb.sku}>{sb.descricao}</option>
                ))}
              </select>
            </label>
            {buscandoSabores ? <span className="text-xs text-slate-400">listando sabores…</span> : null}
            <Button size="sm" variant="ghost" onClick={() => listarTodos(true)} disabled={buscandoSabores} title="Recarregar a lista do Olist">
              ↻
            </Button>
            <span className="ml-auto text-[10px] text-slate-600">v19</span>
            {carregando ? <span className="text-xs text-slate-400">carregando engenharia… (~10s)</span> : null}
          </div>
          {erro ? <p className="text-sm text-amber-400">{erro}</p> : null}
        </CardContent>
      </Card>

      {eng ? (
        <>
          {/* Insumos + custos */}
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 px-4 py-3">
                <span className="text-sm font-bold text-white">🏭 {eng.produto.descricao}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    Rendimento do lote:
                    <Input value={unidadesLote} onChange={(e) => mudarLote(e.target.value)} inputMode="numeric" className="h-8 w-20 text-right" />
                    un
                  </label>
                  <Button size="sm" variant="ghost" onClick={usarCustosOlist}>↻ Recarregar custos do Olist</Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                      <th className="px-4 py-2">Insumo</th>
                      <th className="px-4 py-2 text-right">Qtd/un</th>
                      <th className="px-4 py-2 text-right">Custo Olist</th>
                      <th className="px-4 py-2 text-right">Preço usado (R$)</th>
                      <th className="px-4 py-2 text-right">Custo/un</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {eng.insumos.map((i) => {
                      const key = i.sku ?? i.descricao;
                      const p = num(precos[key] ?? "");
                      return (
                        <tr key={key} className={p <= 0 ? "bg-amber-500/5" : ""}>
                          <td className="px-4 py-1.5 text-slate-100">{i.descricao} <span className="font-mono text-[10px] text-slate-500">{i.sku}</span></td>
                          <td className="px-4 py-1.5 text-right text-slate-300">{Number(porUnidade(i).toFixed(6))}</td>
                          <td className="px-4 py-1.5 text-right text-xs text-slate-400">{i.custoOlist != null ? brl(i.custoOlist) : "sem custo no Olist"}</td>
                          <td className="px-4 py-1.5 text-right">
                            <Input value={precos[key] ?? ""} onChange={(e) => setPrecos((prev) => ({ ...prev, [key]: e.target.value }))} inputMode="decimal" placeholder="0,00" className={`ml-auto w-24 text-right ${p <= 0 ? "border-amber-400" : ""}`} />
                          </td>
                          <td className="px-4 py-1.5 text-right font-medium text-slate-200">{p > 0 ? brl(porUnidade(i) * p) : "—"}</td>
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
                <label className="text-xs text-slate-400">Caixa (R$/un)
                  <Input value={caixaUnit} onChange={(e) => setCaixaUnit(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                <label className="text-xs text-slate-400">Fita (R$/un)
                  <Input value={fitaUnit} onChange={(e) => setFitaUnit(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                <label className="text-xs text-slate-400">Outros (R$/un)
                  <Input value={outrosUnit} onChange={(e) => setOutrosUnit(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                {custo ? (
                  <div className="ml-auto text-right">
                    {custo.semPreco > 0 ? <p className="text-xs text-amber-400">⚠ {custo.semPreco} insumo(s) sem preço — custo parcial</p> : null}
                    <p className="text-xs text-slate-400">Materiais {brl(custo.materiais)} + perda → {brl(custo.comPerda)} + embalagem {brl(custo.embalagem)}</p>
                    <p className="text-lg font-bold text-white">Custo por unidade: <span className="text-emerald-400">{brl(custo.total)}</span></p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Simulador */}
          <Card>
            <CardContent className="space-y-3 pt-4">
              <p className="text-sm font-bold text-white">💰 Formação de preço</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <label className="text-xs text-slate-400">Preço de venda (R$)
                  <Input value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">
                  <span className="flex items-center justify-between gap-1">
                    Imposto venda (%)
                    <span className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={meiaNota}
                        onChange={(e) => { setMeiaNota(e.target.checked); setFretePct(e.target.checked ? "4" : "5"); }}
                        className="accent-violet-600"
                      />
                      Meia nota
                    </span>
                  </span>
                  <Input value={impostoPct} onChange={(e) => setImpostoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                  {meiaNota ? <span className="text-[10px] text-amber-400">incide sobre 50% → efetivo {(num(impostoPct) / 2).toFixed(2).replace(".", ",")}%</span> : null}
                </label>
                <label className="text-xs text-slate-400">Crédito compra (%)
                  <Input value={creditoPct} onChange={(e) => setCreditoPct(e.target.value)} inputMode="decimal" className="mt-1" />
                  <span className="text-[10px] text-slate-500">sobre os materiais (insumos)</span>
                </label>
                <label className="text-xs text-slate-400">Custo fixo (R$/un)
                  <Input value={fixoUnit} onChange={(e) => setFixoUnit(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Frete (% fat.)
                  <Input value={fretePct} onChange={(e) => setFretePct(e.target.value)} inputMode="decimal" className="mt-1" />
                  <span className="flex gap-1 pt-1">
                    <button type="button" className="rounded bg-white/10 px-1.5 text-[10px] text-slate-300" onClick={() => setFretePct("5")}>normal 5%</button>
                    <button type="button" className="rounded bg-white/10 px-1.5 text-[10px] text-slate-300" onClick={() => setFretePct("4")}>meia nota 4%</button>
                  </span>
                </label>
                <label className="text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked={temComissao} onChange={(e) => setTemComissao(e.target.checked)} className="accent-violet-600" />
                    Comissão (%)
                  </span>
                  <Input value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} inputMode="decimal" disabled={!temComissao} className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Cartão à vista (%)
                  <Input value={cartaoVistaPct} onChange={(e) => setCartaoVistaPct(e.target.value)} inputMode="decimal" className="mt-1" />
                </label>
                <label className="text-xs text-slate-400">Cartão até 4x (%)
                  <Input value={cartao4xPct} onChange={(e) => setCartao4xPct(e.target.value)} inputMode="decimal" className="mt-1" />
                  <span className="text-[10px] text-slate-500">1,61%/mês × prazo médio</span>
                </label>
              </div>

              {simVista && sim4x && custo ? (
                <div className="overflow-x-auto">
                  <table className="w-full max-w-2xl text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                        <th className="py-2"></th>
                        <th className="py-2 text-right">💵 À vista</th>
                        <th className="py-2 text-right">💳 Cartão até 4x</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <tr><td className="py-1.5 text-slate-300">Preço de venda</td><td className="py-1.5 text-right font-medium text-white">{brl(num(precoVenda))}</td><td className="py-1.5 text-right font-medium text-white">{brl(num(precoVenda))}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Imposto venda ({meiaNota ? `meia nota · ${(num(impostoPct) / 2).toFixed(2).replace(".", ",")}` : impostoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(simVista.impostoDebito)}</td><td className="py-1.5 text-right text-red-400">−{brl(sim4x.impostoDebito)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">+ Crédito compra ({creditoPct}%)</td><td className="py-1.5 text-right text-emerald-400">+{brl(simVista.credito)}</td><td className="py-1.5 text-right text-emerald-400">+{brl(sim4x.credito)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Cartão</td><td className="py-1.5 text-right text-red-400">−{brl(simVista.cartao)}</td><td className="py-1.5 text-right text-red-400">−{brl(sim4x.cartao)}</td></tr>
                      {temComissao ? <tr><td className="py-1.5 text-slate-400">− Comissão ({comissaoPct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(simVista.comissao)}</td><td className="py-1.5 text-right text-red-400">−{brl(sim4x.comissao)}</td></tr> : null}
                      <tr><td className="py-1.5 text-slate-400">− Custo fixo (R$/un)</td><td className="py-1.5 text-right text-red-400">−{brl(simVista.fixo)}</td><td className="py-1.5 text-right text-red-400">−{brl(sim4x.fixo)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Frete ({fretePct}%)</td><td className="py-1.5 text-right text-red-400">−{brl(simVista.frete)}</td><td className="py-1.5 text-right text-red-400">−{brl(sim4x.frete)}</td></tr>
                      <tr><td className="py-1.5 text-slate-400">− Custo do produto</td><td className="py-1.5 text-right text-red-400">−{brl(custo.total)}</td><td className="py-1.5 text-right text-red-400">−{brl(custo.total)}</td></tr>
                      <tr className="border-t border-white/20">
                        <td className="py-2 font-bold text-white">Lucro / margem</td>
                        <td className={`py-2 text-right font-bold ${simVista.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(simVista.lucro)} ({simVista.margem.toFixed(1)}%)</td>
                        <td className={`py-2 text-right font-bold ${sim4x.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>{brl(sim4x.lucro)} ({sim4x.margem.toFixed(1)}%)</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Preencha o preço de venda para simular.</p>
              )}

              <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-3">
                <label className="text-xs text-slate-400">Margem alvo (%)
                  <Input value={margemAlvo} onChange={(e) => setMargemAlvo(e.target.value)} inputMode="decimal" className="mt-1 w-20" />
                </label>
                <div className="text-sm text-slate-200">
                  {alvoVista != null ? <p>💵 À vista: preço mínimo <b className="text-emerald-400">{brl(alvoVista)}</b></p> : null}
                  {alvo4x != null ? <p>💳 Até 4x: preço mínimo <b className="text-emerald-400">{brl(alvo4x)}</b></p> : null}
                  {alvoVista == null && alvo4x == null ? <p className="text-xs text-amber-400">Taxas + margem alvo passam de 100%.</p> : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoreFor } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";
import { ehCancelado } from "@/lib/pedido";
import { ImprimirButton } from "./imprimir-button";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Status de pedido que geram necessidade de produção (pré-expedição).
const STATUS_ALVO = ["aprovad", "preparando", "pronto", "separa"];
function statusEntra(s: string | null | undefined): boolean {
  const n = String(s ?? "").toLowerCase();
  return STATUS_ALVO.some((k) => n.includes(k));
}

const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export default async function NecessidadesPage() {
  const [store, catalog] = await Promise.all([
    loadStoreFor(["orders", "order_items"] as Array<keyof DataStore>),
    getCatalog(),
  ]);

  // Nome do produto por SKU (catálogo).
  const nomeDeSku = new Map(catalog.map((p) => [p.sku, p.name]));

  // Tokenização para casar por NOME (palavras significativas).
  const STOP = new Set(["pote", "un", "nyer", "de", "e", "da", "do", "sleev"]);
  const toks = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

  // Pedidos ALVO (aprovado / preparando / separação / pronto), não cancelados.
  const pedidosAlvo = store.orders.filter((o) => !ehCancelado(o.tiny_status) && statusEntra(o.tiny_status));
  const idsAlvo = new Set(pedidosAlvo.map((o) => o.id));

  // Soma a quantidade NECESSÁRIA por PRODUTO (agrupado por NOME).
  interface Need { sku: string; nome: string; desc: string; necessario: number; pedidos: Set<string> }
  const need = new Map<string, Need>();
  for (const it of store.order_items) {
    if (!idsAlvo.has(it.order_id)) continue;
    const sku = (it.sku ?? "").trim();
    const desc = (it.description ?? "").trim();
    const nome = nomeDeSku.get(sku) ?? desc ?? sku;
    const key = norm(nome); // agrupa por NOME (não por SKU)
    if (!key) continue;
    const cur = need.get(key) ?? { sku: sku || "—", nome, desc, necessario: 0, pedidos: new Set<string>() };
    cur.necessario += Number(it.quantity) || 0;
    cur.pedidos.add(it.order_id);
    need.set(key, cur);
  }

  // Estoque (balanço) — produto acabado por NOME. Pode estar indisponível.
  let estoqueErro: string | null = null;
  const estoqueExato = new Map<string, { qtd: number; nome: string }>();
  const balItens: { nome: string; nomeNorm: string; toks: Set<string>; qtd: number }[] = [];
  try {
    const rep = await getEstoqueReport();
    for (const item of rep.itens) {
      if (item.categoria !== "produto_acabado") continue;
      const k = norm(item.nome);
      const prev = estoqueExato.get(k);
      estoqueExato.set(k, { qtd: (prev?.qtd ?? 0) + item.quantidade, nome: item.nome });
      balItens.push({ nome: item.nome, nomeNorm: k, toks: new Set(toks(item.nome)), qtd: item.quantidade });
    }
  } catch (e) {
    estoqueErro = e instanceof EstoqueIndisponivelError ? e.message : "Não foi possível ler o balanço de estoque.";
  }

  // Casa o produto com o balanço POR NOME: exato → maior sobreposição de palavras
  // (com bônus quando um nome é subconjunto do outro — separa "Chocolate" de
  // "Chocolate Maltado").
  function saldoDe(nome: string, alt: string): { saldo: number | null; casou: string | null } {
    if (balItens.length === 0) return { saldo: null, casou: null };
    for (const c of [nome, alt]) {
      const k = norm(c);
      const hit = k && estoqueExato.get(k);
      if (hit) return { saldo: hit.qtd, casou: hit.nome };
    }
    let best: { qtd: number; score: number; nome: string } | null = null;
    for (const c of [nome, alt]) {
      const pt = toks(c);
      if (pt.length === 0) continue;
      for (const b of balItens) {
        let shared = 0;
        for (const t of pt) if (b.toks.has(t)) shared++;
        if (shared === 0) continue;
        const balArr = [...b.toks];
        const subset = pt.every((t) => b.toks.has(t)) || balArr.every((t) => pt.includes(t));
        const score = shared + (subset ? 5 : 0);
        if (shared >= Math.min(2, pt.length) && (!best || score > best.score)) best = { qtd: b.qtd, score, nome: b.nome };
      }
    }
    return best ? { saldo: best.qtd, casou: best.nome } : { saldo: null, casou: null };
  }

  // TODAS as linhas (para diagnóstico do casamento), ordenadas por falta.
  const todas = [...need.values()]
    .map((n) => {
      const { saldo, casou } = saldoDe(n.nome, n.desc);
      const emEstoque = saldo ?? 0;
      const falta = n.necessario - emEstoque;
      return { ...n, emEstoque, saldoEncontrado: saldo !== null, casou, falta };
    })
    .sort((a, b) => b.falta - a.falta);
  const linhas = todas.filter((l) => l.falta > 0); // demanda (o que falta)

  const brl = (n: number) => n.toLocaleString("pt-BR");

  const hojeStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <div className="no-print mb-1 flex items-start justify-between gap-3">
        <PageHeader
          title="🏭 Necessidades de Produção"
          description="Produtos a produzir: soma dos pedidos aprovados / preparando / em separação / prontos para envio, menos o balanço de estoque."
        />
        <ImprimirButton />
      </div>

      {/* Cabeçalho só na impressão */}
      <div className="print-only mb-3">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Demanda de Produção — NYER</h1>
        <p style={{ fontSize: 12 }}>Gerado em {hojeStr} · {pedidosAlvo.length} pedidos · {linhas.length} produtos a produzir</p>
      </div>

      {/* ALERTA de demanda */}
      {linhas.length > 0 ? (
        <div className="no-print mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
          🔔 <b>{linhas.length}</b> produto(s) precisam de produção — {brl(linhas.reduce((s, l) => s + l.falta, 0))} unidades no total.
        </div>
      ) : null}

      {estoqueErro ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
          ⚠️ {estoqueErro} — mostrando a necessidade total (sem descontar o estoque).
        </div>
      ) : null}

      <div className="no-print mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Pedidos considerados</div>
          <div className="mt-1 text-2xl font-bold text-white">{pedidosAlvo.length}</div>
          <div className="text-[11px] text-slate-400">aprovado · preparando · pronto p/ envio</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Produtos em falta</div>
          <div className={`mt-1 text-2xl font-bold ${linhas.length > 0 ? "text-red-400" : "text-emerald-400"}`}>{linhas.length}</div>
          <div className="text-[11px] text-slate-400">SKUs que precisam produzir</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase text-slate-400">Unidades a produzir</div>
          <div className="mt-1 text-2xl font-bold text-white">{brl(linhas.reduce((s, l) => s + l.falta, 0))}</div>
          <div className="text-[11px] text-slate-400">soma do que falta</div>
        </div>
      </div>

      <Card className="print-area">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Demanda × balanço (confira a coluna "Casou com")
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Nome no pedido</th>
                  <th className="px-4 py-2">Casou com (balanço)</th>
                  <th className="px-4 py-2 text-right">Necessário</th>
                  <th className="px-4 py-2 text-right">Em estoque</th>
                  <th className="px-4 py-2 text-right">Falta</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {todas.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Nenhum item nos pedidos alvo.</td></tr>
                ) : todas.map((l) => (
                  <tr key={l.nome} className={l.falta > 0 ? "" : "opacity-60"}>
                    <td className="px-4 py-2 font-medium text-white">{l.nome}</td>
                    <td className="px-4 py-2 text-xs">
                      {l.casou ? <span className="text-sky-300">{l.casou}</span> : <span className="text-amber-400">✗ não casou</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(l.necessario)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{l.saldoEncontrado ? brl(l.emEstoque) : "—"}</td>
                    <td className={`px-4 py-2 text-right font-bold ${l.falta > 0 ? "text-red-400" : "text-emerald-400"}`}>{l.falta > 0 ? brl(l.falta) : "0"}</td>
                    <td className="px-4 py-2 text-right text-slate-400">{l.pedidos.size}</td>
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

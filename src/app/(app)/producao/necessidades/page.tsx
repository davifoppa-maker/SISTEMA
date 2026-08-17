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

  // Pedidos ALVO (aprovado / preparando / pronto), não cancelados.
  const pedidosAlvo = store.orders.filter((o) => !ehCancelado(o.tiny_status) && statusEntra(o.tiny_status));
  const idsAlvo = new Set(pedidosAlvo.map((o) => o.id));

  // Soma a quantidade NECESSÁRIA por SKU (itens dos pedidos alvo).
  interface Need { sku: string; nome: string; necessario: number; pedidos: Set<string> }
  const need = new Map<string, Need>();
  for (const it of store.order_items) {
    if (!idsAlvo.has(it.order_id)) continue;
    const sku = (it.sku ?? "").trim();
    const key = sku || (it.description ?? "").trim();
    if (!key) continue;
    const nome = nomeDeSku.get(sku) ?? it.description ?? sku;
    const cur = need.get(key) ?? { sku: sku || "—", nome, necessario: 0, pedidos: new Set<string>() };
    cur.necessario += Number(it.quantity) || 0;
    cur.pedidos.add(it.order_id);
    need.set(key, cur);
  }

  // Estoque (balanço) — produto acabado por nome. Pode estar indisponível.
  let estoqueErro: string | null = null;
  const estoquePorNome = new Map<string, number>();
  try {
    const rep = await getEstoqueReport();
    for (const item of rep.itens) {
      if (item.categoria !== "produto_acabado") continue;
      const k = norm(item.nome);
      estoquePorNome.set(k, (estoquePorNome.get(k) ?? 0) + item.quantidade);
    }
  } catch (e) {
    estoqueErro = e instanceof EstoqueIndisponivelError ? e.message : "Não foi possível ler o balanço de estoque.";
  }

  // Casa o produto necessário com o saldo do balanço (por nome normalizado).
  function saldoDe(nome: string): number | null {
    if (estoquePorNome.size === 0) return null;
    const p = norm(nome);
    if (estoquePorNome.has(p)) return estoquePorNome.get(p)!;
    // fallback: nome do balanço que contém o do produto (ou vice-versa).
    for (const [k, v] of estoquePorNome) {
      if (k === p) return v;
      if (k.includes(p) || p.includes(k)) return v;
    }
    return null; // não encontrado no balanço
  }

  const linhas = [...need.values()]
    .map((n) => {
      const saldo = saldoDe(n.nome);
      const emEstoque = saldo ?? 0;
      const falta = n.necessario - emEstoque;
      return { ...n, emEstoque, saldoEncontrado: saldo !== null, falta };
    })
    .filter((l) => l.falta > 0) // só o que FALTA vira necessidade
    .sort((a, b) => b.falta - a.falta);

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
            Solicitações de demanda (produzir)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2 text-right">Necessário</th>
                  <th className="px-4 py-2 text-right">Em estoque</th>
                  <th className="px-4 py-2 text-right">Falta (produzir)</th>
                  <th className="px-4 py-2 text-right">Pedidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {linhas.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-emerald-400">Tudo coberto pelo estoque. Nada a produzir. ✅</td></tr>
                ) : linhas.map((l) => (
                  <tr key={l.sku + l.nome}>
                    <td className="px-4 py-2 font-medium text-white">{l.nome}</td>
                    <td className="px-4 py-2 text-slate-400">{l.sku}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{brl(l.necessario)}</td>
                    <td className="px-4 py-2 text-right text-slate-300">
                      {l.saldoEncontrado ? brl(l.emEstoque) : <span className="text-amber-400" title="Produto não encontrado no balanço">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-red-400">{brl(l.falta)}</td>
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

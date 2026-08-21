import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoreFor } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";
import { ehCancelado, clienteIgnorado, pedidoNumIgnorado } from "@/lib/pedido";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// FILA DE EXPEDIÇÃO — decisão automática de qual pedido enviar:
//   1) ordena por antiguidade (mais antigo primeiro; prazo = 7 dias);
//   2) bate os itens com o estoque do balanço, CONSUMINDO em cascata
//      (o pedido da frente reserva o estoque; o de trás vê o que sobrou);
//   3) tem tudo → SEPARAR; falta algo → AGUARDAR PRODUÇÃO (com o que falta).
// Um clique = abrir esta página; o topo mostra O pedido a puxar agora.

const PRAZO_DIAS = 7;
// Fila = pedidos aguardando decisão (aprovado/aberto). "Preparando/pronto" já
// estão em andamento na expedição e ficam fora da fila.
const STATUS_FILA = ["abert", "aprovad"];

const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const STOP = new Set(["pote", "un", "nyer", "de", "e", "da", "do", "sleev"]);
const toks = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

export default async function FilaExpedicaoPage() {
  const [store, catalog] = await Promise.all([
    loadStoreFor(["orders", "order_items", "customers"] as Array<keyof DataStore>),
    getCatalog(),
  ]);
  const nomeDeSku = new Map(catalog.map((p) => [p.sku, p.name]));
  const clienteDe = new Map(store.customers.map((c) => [c.id, c.name]));

  // Estoque do balanço: por SKU + índices por nome (mesma lógica das Necessidades).
  let estoqueErro: string | null = null;
  const saldoPorSku = new Map<string, number>();
  const saldoPorNome = new Map<string, number>();
  const balNomes: { nome: string; chave: string; toks: Set<string> }[] = [];
  try {
    const rep = await getEstoqueReport();
    for (const item of rep.itens) {
      if (item.sku) {
        const s = item.sku.toUpperCase();
        saldoPorSku.set(s, (saldoPorSku.get(s) ?? 0) + item.quantidade);
      }
      const k = norm(item.nome);
      saldoPorNome.set(k, (saldoPorNome.get(k) ?? 0) + item.quantidade);
      balNomes.push({ nome: item.nome, chave: k, toks: new Set(toks(item.nome)) });
    }
  } catch (e) {
    estoqueErro = e instanceof EstoqueIndisponivelError ? e.message : "Balanço de estoque indisponível.";
  }

  // Resolve a CHAVE de estoque de um item do pedido (SKU → nome exato → nome~).
  function chaveEstoque(sku: string | null, desc: string | null): { tipo: "sku" | "nome"; chave: string } | null {
    const s = (sku ?? "").trim().toUpperCase();
    if (s && saldoPorSku.has(s)) return { tipo: "sku", chave: s };
    const candidatos = [nomeDeSku.get((sku ?? "").trim()) ?? "", desc ?? ""];
    for (const c of candidatos) {
      const k = norm(c);
      if (k && saldoPorNome.has(k)) return { tipo: "nome", chave: k };
    }
    for (const c of candidatos) {
      const pt = toks(c);
      if (pt.length === 0) continue;
      for (const b of balNomes) {
        const subset = pt.every((t) => b.toks.has(t)) || [...b.toks].every((t) => pt.includes(t));
        if (subset) return { tipo: "nome", chave: b.chave };
      }
    }
    return null;
  }
  const saldoDe = (r: { tipo: "sku" | "nome"; chave: string }) =>
    r.tipo === "sku" ? (saldoPorSku.get(r.chave) ?? 0) : (saldoPorNome.get(r.chave) ?? 0);
  const consome = (r: { tipo: "sku" | "nome"; chave: string }, q: number) => {
    if (r.tipo === "sku") saldoPorSku.set(r.chave, (saldoPorSku.get(r.chave) ?? 0) - q);
    else saldoPorNome.set(r.chave, (saldoPorNome.get(r.chave) ?? 0) - q);
  };

  // Pedidos da fila, mais antigo primeiro.
  const hoje = Date.now();
  const itensPorPedido = new Map<string, { sku: string | null; description: string | null; quantity: number }[]>();
  for (const i of store.order_items) {
    const arr = itensPorPedido.get(i.order_id) ?? [];
    arr.push(i);
    itensPorPedido.set(i.order_id, arr);
  }

  interface Linha {
    id: string; numero: string; cliente: string; data: string; dias: number; atrasado: boolean;
    decisao: "separar" | "producao" | "sem_itens";
    faltas: { nome: string; falta: number }[];
    valor: number;
  }
  const fila: Linha[] = [];
  const candidatos = store.orders
    .filter((o) => !ehCancelado(o.tiny_status) && !pedidoNumIgnorado(o.order_number))
    .filter((o) => { const s = String(o.tiny_status ?? "").toLowerCase(); return STATUS_FILA.some((k) => s.includes(k)); })
    .filter((o) => !clienteIgnorado(clienteDe.get(o.customer_id ?? "") ?? ""))
    .sort((a, b) => String(a.order_date ?? "").localeCompare(String(b.order_date ?? "")));

  for (const o of candidatos) {
    const dia = String(o.order_date ?? "").slice(0, 10);
    const dias = dia ? Math.max(0, Math.floor((hoje - Date.parse(dia)) / 86400000)) : 0;
    const its = itensPorPedido.get(o.id) ?? [];
    let decisao: Linha["decisao"] = "separar";
    const faltas: { nome: string; falta: number }[] = [];
    if (its.length === 0) {
      decisao = "sem_itens";
    } else if (!estoqueErro) {
      // 1ª passada: TODOS os itens têm saldo? (sem consumir ainda)
      const reservas: { r: { tipo: "sku" | "nome"; chave: string }; q: number }[] = [];
      for (const it of its) {
        const q = Number(it.quantity) || 0;
        if (q <= 0) continue;
        const r = chaveEstoque(it.sku, it.description);
        const nome = nomeDeSku.get((it.sku ?? "").trim()) ?? it.description ?? it.sku ?? "Item";
        if (!r) { faltas.push({ nome: `${nome} (não achado no balanço)`, falta: q }); continue; }
        const saldo = saldoDe(r);
        if (saldo < q) faltas.push({ nome, falta: q - Math.max(0, saldo) });
        else reservas.push({ r, q });
      }
      if (faltas.length > 0) decisao = "producao";
      else for (const res of reservas) consome(res.r, res.q); // reserva em cascata
    }
    fila.push({
      id: o.id, numero: o.order_number, cliente: clienteDe.get(o.customer_id ?? "") ?? "—",
      data: dia || "—", dias, atrasado: dias > PRAZO_DIAS, decisao, faltas,
      valor: o.total_value ?? 0,
    });
  }

  const proximo = fila.find((l) => l.decisao === "separar") ?? null;
  const nAtrasados = fila.filter((l) => l.atrasado).length;
  const nSeparar = fila.filter((l) => l.decisao === "separar").length;
  const nProducao = fila.filter((l) => l.decisao === "producao").length;
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <PageHeader
        title="🎯 Fila de Expedição"
        description={`Decisão automática: mais antigo primeiro (prazo ${PRAZO_DIAS} dias), batendo com o estoque em cascata. Tem tudo → separar; falta → produção.`}
      />

      {estoqueErro ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          ⚠ {estoqueErro} — a fila está ordenada, mas sem a checagem de estoque.
        </div>
      ) : null}

      {/* O PRÓXIMO pedido a puxar */}
      <Card className="mb-4 border-emerald-500/40">
        <CardContent className="pt-4">
          {proximo ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Puxar agora → separação</p>
                <p className="text-2xl font-bold text-white">#{proximo.numero} · {proximo.cliente}</p>
                <p className="text-sm text-slate-400">
                  {proximo.dias} dia(s) na fila {proximo.atrasado ? <span className="font-semibold text-red-400">· ATRASADO (prazo {PRAZO_DIAS}d)</span> : `· dentro do prazo`} · {brl(proximo.valor)}
                </p>
              </div>
              <Link href={`/orders/${proximo.id}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                Abrir pedido →
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhum pedido com estoque completo para separar agora.</p>
          )}
        </CardContent>
      </Card>

      {/* KPIs da fila */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-red-400">{nAtrasados}</p><p className="text-xs text-slate-400">atrasados (&gt;{PRAZO_DIAS}d)</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-emerald-400">{nSeparar}</p><p className="text-xs text-slate-400">prontos p/ separar</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-2xl font-bold text-amber-400">{nProducao}</p><p className="text-xs text-slate-400">aguardando produção</p></CardContent></Card>
      </div>

      {/* Fila completa */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="text-sm font-semibold text-white">Fila completa ({fila.length} pedidos)</span>
            <Link href="/producao/necessidades" className="text-xs text-brand-700 hover:underline">Necessidades de produção →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2 text-right">Dias</th>
                  <th className="px-4 py-2">Prazo</th>
                  <th className="px-4 py-2">Decisão</th>
                  <th className="px-4 py-2">Falta (produzir)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {fila.map((l, i) => (
                  <tr key={l.id} className={l.decisao === "separar" && l.id === proximo?.id ? "bg-emerald-500/10" : l.atrasado ? "bg-red-500/5" : ""}>
                    <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2"><Link href={`/orders/${l.id}`} className="font-semibold text-brand-700 hover:underline">#{l.numero}</Link></td>
                    <td className="px-4 py-2 text-slate-200">{l.cliente}</td>
                    <td className="px-4 py-2 text-right text-slate-300">{l.dias}</td>
                    <td className="px-4 py-2">
                      {l.atrasado
                        ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-400">atrasado {l.dias - PRAZO_DIAS}d</span>
                        : <span className="text-xs text-slate-400">{PRAZO_DIAS - l.dias}d restantes</span>}
                    </td>
                    <td className="px-4 py-2">
                      {l.decisao === "separar" ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">✓ separar</span>
                        : l.decisao === "producao" ? <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-400">⏳ aguardar produção</span>
                        : <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-slate-400">sem itens (sincronizando)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {l.faltas.slice(0, 3).map((f) => `${f.nome} (${f.falta})`).join(", ")}{l.faltas.length > 3 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        Prazo contado da DATA DO PEDIDO (aproximação da aprovação). Estoque reservado em cascata: quem está na frente da fila reserva primeiro.
      </p>
    </>
  );
}

import { ok, fail } from "@/lib/api";
import { loadStoreFor } from "@/lib/db";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { ehCancelado } from "@/lib/pedido";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPANIES = ["nyer", "ecopro"] as const;

// Reconciliação: soma do faturamento no OLIST x no NOSSO BANCO, no mesmo período,
// e lista os pedidos que existem em um lado e não no outro.
//   GET /api/debug/olist-vs-sistema?k=exxdebug&de=YYYY-MM-DD&ate=YYYY-MM-DD
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const de = url.searchParams.get("de") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const ate = url.searchParams.get("ate") || new Date().toISOString().slice(0, 10);

  // 1) OLIST: pagina os pedidos de cada empresa no período.
  const olist = new Map<string, { valor: number; situacao: string; empresa: string }>();
  let olistTotal = 0, olistTotalSemCancelado = 0, olistCount = 0;
  const olistErros: Record<string, string> = {};
  for (const empresa of COMPANIES) {
    if (!(await isTinyConnected(empresa).catch(() => false))) { olistErros[empresa] = "não conectado"; continue; }
    try {
      for (let offset = 0; offset < 2000; offset += 100) {
        const lote = await fetchRecentOrders({ dataInicial: de, dataFinal: ate, limit: 100, offset }, empresa);
        if (!lote.length) break;
        for (const p of lote as any[]) {
          const numero = String(p.numero ?? "");
          const valor = Number(p.valor ?? 0) || 0;
          const situacao = String(p.situacao ?? "");
          if (numero && !olist.has(numero)) {
            olist.set(numero, { valor, situacao, empresa });
            olistCount++;
            olistTotal += valor;
            if (!ehCancelado(situacao)) olistTotalSemCancelado += valor;
          }
        }
        if (lote.length < 100) break;
      }
    } catch (e) {
      olistErros[empresa] = e instanceof Error ? e.message : String(e);
    }
  }

  // 2) NOSSO BANCO: pedidos no mesmo período.
  const tables: Array<keyof DataStore> = ["orders"];
  const store = await loadStoreFor(tables);
  const dentro = (d: string | null) => { const x = (d ?? "").slice(0, 10); return !!x && x >= de && x <= ate; };
  const nosso = new Map<string, { valor: number; situacao: string }>();
  let nossoTotal = 0, nossoTotalSemCancelado = 0, nossoCount = 0;
  for (const o of store.orders) {
    if (!dentro(o.order_date)) continue;
    const numero = String(o.order_number ?? "");
    const valor = Number(o.total_value ?? 0) || 0;
    nosso.set(numero, { valor, situacao: o.tiny_status ?? "" });
    nossoCount++;
    nossoTotal += valor;
    if (!ehCancelado(o.tiny_status)) nossoTotalSemCancelado += valor;
  }

  // 3) Diferenças por número de pedido.
  const soNoOlist = [...olist.entries()].filter(([n]) => !nosso.has(n))
    .map(([numero, v]) => ({ numero, valor: Math.round(v.valor), situacao: v.situacao, empresa: v.empresa }))
    .sort((a, b) => b.valor - a.valor);
  const soNoNosso = [...nosso.entries()].filter(([n]) => !olist.has(n))
    .map(([numero, v]) => ({ numero, valor: Math.round(v.valor), situacao: v.situacao }))
    .sort((a, b) => b.valor - a.valor);
  // Mesmo pedido com valor diferente entre os dois lados.
  const valorDivergente = [...olist.entries()].filter(([n, v]) => {
    const meu = nosso.get(n); return meu && Math.abs(meu.valor - v.valor) > 0.5;
  }).map(([numero, v]) => ({ numero, olist: Math.round(v.valor), nosso: Math.round(nosso.get(numero)!.valor) }))
    .sort((a, b) => Math.abs(b.olist - b.nosso) - Math.abs(a.olist - a.nosso)).slice(0, 30);

  return ok({
    periodo: { de, ate },
    olist: {
      pedidos: olistCount,
      faturamento_total: Math.round(olistTotal),
      faturamento_sem_cancelados: Math.round(olistTotalSemCancelado),
      erros: olistErros,
    },
    nosso_sistema: {
      pedidos: nossoCount,
      faturamento_total: Math.round(nossoTotal),
      faturamento_sem_cancelados: Math.round(nossoTotalSemCancelado),
    },
    diferenca_sem_cancelados: Math.round(olistTotalSemCancelado - nossoTotalSemCancelado),
    pedidos_so_no_olist: soNoOlist.slice(0, 40),
    pedidos_so_no_nosso: soNoNosso.slice(0, 40),
    valor_divergente: valorDivergente,
  });
}

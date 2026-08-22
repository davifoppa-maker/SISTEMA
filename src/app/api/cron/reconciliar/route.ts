import { ok } from "@/lib/api";
import { loadStore, commitStore } from "@/lib/db";
import { removeOrderCascade } from "@/lib/services/tiny";
import { getTinyConfig, tinyFetch, fetchOrderById } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// RECONCILIAÇÃO DE EXCLUSÕES: o que foi APAGADO no Olist é apagado aqui.
// Lista os pedidos do período nas DUAS contas do Tiny (paginado — barato) e
// remove do sistema qualquer pedido do período cujo tiny_id não exista mais
// em NENHUMA conta, com dupla checagem individual (404 confirmado) antes de
// excluir — indisponibilidade de rede nunca apaga nada.
//   POST/GET /api/cron/reconciliar?dias=90 (roda também no cron diário)
export async function POST(req: Request) {
  const u = new URL(req.url);
  const dias = Math.min(Number(u.searchParams.get("dias")) || 90, 365);
  const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dataInicial = iso(new Date(hoje.getTime() - dias * 86400000));
  const dataFinal = iso(hoje);

  // 1) Todos os tiny_ids que EXISTEM no Tiny (as duas contas), no período.
  const existentes = new Set<string>();
  const listagemOk: Record<string, boolean> = {};
  for (const empresa of ["nyer", "ecopro"]) {
    const c = getTinyConfig(empresa);
    let paginasOk = 0;
    try {
      for (let offset = 0; offset < 3000; offset += 100) {
        const r = await tinyFetch(
          `${c.apiBaseUrl}${c.ordersPath}?dataInicial=${dataInicial}&dataFinal=${dataFinal}&limit=100&offset=${offset}`,
          {},
          empresa,
        );
        if (!r.ok) throw new Error(`listagem ${r.status}`);
        const j = (await r.json().catch(() => null)) as any;
        const itens: any[] = j?.itens ?? j?.data ?? j?.pedidos ?? [];
        if (!Array.isArray(itens) || itens.length === 0) break;
        for (const p of itens) if (p?.id) existentes.add(String(p.id));
        if (itens.length < 100) break;
        await pausa(200);
      }
      paginasOk = 1;
    } catch { /* conta indisponível → NÃO apagar nada baseado nela */ }
    listagemOk[empresa] = paginasOk === 1;
  }
  // Se NENHUMA listagem funcionou, aborta — sem base de comparação.
  if (!listagemOk.nyer && !listagemOk.ecopro) {
    return ok({ aviso: "Tiny indisponível — nada verificado.", removidos: 0 });
  }

  // 2) Pedidos do sistema no período que sumiram da listagem → dupla checagem.
  const store = await loadStore();
  const noPeriodo = store.orders.filter((o) => {
    const d = (o.order_date ?? "").slice(0, 10);
    return o.tiny_id && d >= dataInicial && d <= dataFinal;
  });
  const suspeitos = noPeriodo.filter((o) => !existentes.has(String(o.tiny_id)));

  let removidos = 0;
  const removidosNums: string[] = [];
  for (const o of suspeitos.slice(0, 30)) {
    // Confirmação individual nas duas contas: só apaga com 404 real nas duas.
    let achou = false;
    let erroRede = false;
    for (const emp of ["nyer", "ecopro"]) {
      try {
        const p = await fetchOrderById(String(o.tiny_id), emp);
        if (p) { achou = true; break; }
      } catch { erroRede = true; }
      await pausa(150);
    }
    if (!achou && !erroRede) {
      removeOrderCascade(store, o.id);
      removidos++;
      removidosNums.push(o.order_number);
    }
  }

  if (removidos > 0) await commitStore(store);
  return ok({
    periodo: `${dataInicial} a ${dataFinal}`,
    listagemOk,
    tinyExistentes: existentes.size,
    sistemaNoPeriodo: noPeriodo.length,
    suspeitos: suspeitos.length,
    removidos,
    removidosNums,
  });
}

// GET: usado pelo cron do Vercel e para rodar manualmente pelo navegador.
export async function GET(req: Request) { return POST(req); }

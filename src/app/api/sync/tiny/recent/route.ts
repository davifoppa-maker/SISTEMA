import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { ingestOrder, enrichExpeditionNFs, resyncProcessingB2bOrders, reprocessPendingWebhooks } from "@/lib/services/tiny";
import { runSlaAndTrackingChecks } from "@/lib/services/automation";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 60;

// Ressincroniza pedidos recentes.
//   • Se o corpo trouxer um array de pedidos, usa-os (modo simulação / replay).
//   • Caso contrário, e havendo conexão com o Tiny, busca os pedidos na API V3.
export async function POST(req: Request) {
  const store = await loadStore();

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* sem corpo: tenta a API real abaixo */
  }

  // Filtro de data via querystring (?inicio=YYYY-MM-DD&fim=YYYY-MM-DD).
  const sp = new URL(req.url).searchParams;
  const dataInicial = sp.get("inicio") || undefined;
  const dataFinal = sp.get("fim") || undefined;

  let list: unknown[];
  if (Array.isArray(body) && body.length > 0) {
    list = body;
  } else if (await isTinyConnected().catch(() => false)) {
    try {
      // Pagina os resultados (Tiny entrega 100 por página). Teto por execução
      // para não estourar o tempo da função mesmo no plano Pro.
      const collected: unknown[] = [];
      const MAX = 600;
      for (let offset = 0; offset < MAX; offset += 100) {
        const page = await fetchRecentOrders({ dataInicial, dataFinal, limit: 100, offset });
        collected.push(...page);
        if (page.length < 100) break;
      }
      list = collected;
    } catch (err) {
      store.api_sync_logs.push({
        id: uuid(),
        source: "tiny",
        operation: "sync_recent",
        ok: false,
        detail: err instanceof Error ? err.message : "erro",
        created_at: nowIso(),
      });
      await commitStore(store);
      return fail("Falha ao buscar pedidos no Tiny", 502, err instanceof Error ? err.message : err);
    }
  } else {
    return ok({ synced: 0, results: [], note: "Sem corpo e Tiny não conectado — nada a sincronizar." });
  }

  const results: { order_id: string; channel: string }[] = [];
  for (const item of list) {
    const parsed = tinyOrderSchema.parse(item);
    const order = ingestOrder(store, parsed);
    results.push({ order_id: order.id, channel: order.channel });
  }

  // Reprocessa webhooks que ficaram pendentes (detalhe do Tiny falhou na hora).
  const webhooksReprocessed = await reprocessPendingWebhooks(store, 30).catch(() => 0);
  // Re-busca por ID os B2B "em processamento" (mesmo antigos, fora da janela
  // recente) para refletir avanços de status feitos direto no Tiny.
  const b2bResynced = await resyncProcessingB2bOrders(store, 60).catch(() => 0);
  // Também puxa NF + frete + prazo + código de rastreio dos B2B em expedição.
  const nfEnriched = await enrichExpeditionNFs(store, 50).catch(() => 0);
  // Reavalia SLA/rastreio (resolve "sem rastreio" se já capturou o código, etc.).
  runSlaAndTrackingChecks(store);

  store.api_sync_logs.push({
    id: uuid(),
    source: "tiny",
    operation: "sync_recent",
    ok: true,
    detail: `${results.length} pedidos${dataInicial ? ` (${dataInicial} a ${dataFinal ?? dataInicial})` : ""}, ${b2bResynced} B2B re-sync, ${nfEnriched} NF, ${webhooksReprocessed} webhooks reprocessados`,
    created_at: nowIso(),
  });

  await commitStore(store);
  return ok({ synced: results.length, b2bResynced, nfEnriched, webhooksReprocessed, results });
}

import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { runSlaAndTrackingChecks } from "@/lib/services/automation";
import { pollCarrierTracking } from "@/lib/services/freight/tracking-poll";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { ingestOrder, enrichExpeditionNFs, reprocessPendingWebhooks, enrichOrderItems } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 60;

// Atualiza o status dos pedidos recentes consultando o Tiny (sync diário).
async function syncRecentStatuses(store: Awaited<ReturnType<typeof loadStore>>): Promise<number> {
  if (!(await isTinyConnected().catch(() => false))) return 0;
  const dataFinal = new Date().toISOString().slice(0, 10);
  const dataInicial = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  let count = 0;
  try {
    const list = await fetchRecentOrders({ dataInicial, dataFinal, limit: 100 });
    for (const payload of list) {
      ingestOrder(store, tinyOrderSchema.parse(payload));
      count++;
    }
    store.api_sync_logs.push({
      id: uuid(),
      source: "tiny",
      operation: "cron_sync",
      ok: true,
      detail: `${count} pedidos (${dataInicial} a ${dataFinal})`,
      created_at: nowIso(),
    });
  } catch (err) {
    store.api_sync_logs.push({
      id: uuid(),
      source: "tiny",
      operation: "cron_sync",
      ok: false,
      detail: err instanceof Error ? err.message : "erro",
      created_at: nowIso(),
    });
  }
  return count;
}

// Job recorrente (Vercel Cron) de verificação de SLA/rastreio. Protegido por CRON_SECRET.
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const url = new URL(req.url);
    const provided = auth?.replace("Bearer ", "") ?? url.searchParams.get("secret");
    if (provided !== secret) return fail("Não autorizado", 401);
  }
  const store = await loadStore();
  const synced = await syncRecentStatuses(store);
  // Reprocessa webhooks pendentes (o detalhe do Tiny falhou na hora do evento).
  const webhooksReprocessed = await reprocessPendingWebhooks(store, 30).catch(() => 0);
  // Grava os status JÁ sincronizados antes da parte pesada (puxar NFs). Assim,
  // se a função expirar no meio do enrich, os status do pedido não se perdem.
  await commitStore(store).catch(() => {});
  const nfEnriched = await enrichExpeditionNFs(store, 25).catch(() => 0);
  const itemsEnriched = await enrichOrderItems(store, 30).catch(() => 0);
  // Rastreio nas transportadoras (Arlete/Jadlog): grava eventos e sugere a baixa
  // quando a entrega é confirmada (não dá baixa sozinho).
  const tracking = await pollCarrierTracking(store, 40).catch(() => null);
  const result = runSlaAndTrackingChecks(store);
  await commitStore(store);
  return ok({ ...result, synced, nfEnriched, itemsEnriched, webhooksReprocessed, tracking });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

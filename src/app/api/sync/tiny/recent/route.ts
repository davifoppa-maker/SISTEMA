import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { ingestOrder, enrichExpeditionNFs, resyncProcessingB2bOrders, reprocessPendingWebhooks, enrichOrderDates, enrichOrderItems } from "@/lib/services/tiny";
import { runSlaAndTrackingChecks } from "@/lib/services/automation";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

export const maxDuration = 60;

// Ressincroniza pedidos recentes de todas as empresas conectadas (NYER + Ecopro).
export async function POST(req: Request) {
  const store = await loadStore();

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* sem corpo: tenta a API real abaixo */
  }

  const sp = new URL(req.url).searchParams;
  const dataInicial = sp.get("inicio") || undefined;
  const dataFinal = sp.get("fim") || undefined;
  // Se ?empresa= informado, sincroniza só essa empresa; senão sincroniza todas.
  const empresaFilter = sp.get("empresa") || null;

  const results: { order_id: string; channel: string; empresa: string }[] = [];

  if (Array.isArray(body) && body.length > 0) {
    // Modo simulação: usa os pedidos do corpo (sem empresa definida)
    for (const item of body) {
      const parsed = tinyOrderSchema.parse(item);
      const order = ingestOrder(store, parsed);
      results.push({ order_id: order.id, channel: order.channel, empresa: (order as any).empresa ?? "nyer" });
    }
  } else {
    // Sincroniza cada empresa conectada
    const allCompanies: Array<{ id: string; label: string }> = [
      { id: "nyer", label: "NYER" },
      { id: "ecopro", label: "Ecopro" },
    ];
    const companies = empresaFilter
      ? allCompanies.filter((c) => c.id === empresaFilter)
      : allCompanies;

    for (const company of companies) {
      const connected = await isTinyConnected(company.id).catch(() => false);
      if (!connected) continue;

      try {
        const collected: unknown[] = [];
        const MAX = 600;
        for (let offset = 0; offset < MAX; offset += 100) {
          const page = await fetchRecentOrders({ dataInicial, dataFinal, limit: 100, offset }, company.id);
          collected.push(...page);
          if (page.length < 100) break;
        }

        for (const item of collected) {
          const parsed = tinyOrderSchema.parse(item);
          const order = ingestOrder(store, parsed, company.id);
          results.push({ order_id: order.id, channel: order.channel, empresa: company.id });
        }
      } catch (err) {
        store.api_sync_logs.push({
          id: uuid(),
          source: "tiny",
          operation: "sync_recent",
          ok: false,
          detail: `${company.label}: ${err instanceof Error ? err.message : "erro"}`,
          created_at: nowIso(),
        });
      }
    }

    if (results.length === 0 && !(await isTinyConnected("nyer").catch(() => false)) && !(await isTinyConnected("ecopro").catch(() => false))) {
      await commitStore(store);
      return ok({ synced: 0, results: [], note: "Nenhuma empresa conectada ao Tiny." });
    }
  }

  const webhooksReprocessed = await reprocessPendingWebhooks(store, 30).catch(() => 0);
  const datesEnriched = await enrichOrderDates(store, 40).catch(() => 0);
  const itemsEnriched = await enrichOrderItems(store, 50).catch(() => 0);
  const b2bResynced = await resyncProcessingB2bOrders(store, 60).catch(() => 0);
  const nfEnriched = await enrichExpeditionNFs(store, 50).catch(() => 0);
  runSlaAndTrackingChecks(store);

  store.api_sync_logs.push({
    id: uuid(),
    source: "tiny",
    operation: "sync_recent",
    ok: true,
    detail: `${results.length} pedidos${dataInicial ? ` (${dataInicial} a ${dataFinal ?? dataInicial})` : ""}, ${b2bResynced} B2B re-sync, ${nfEnriched} NF, ${webhooksReprocessed} webhooks reprocessados, ${itemsEnriched} itens enriquecidos`,
    created_at: nowIso(),
  });

  await commitStore(store);
  return ok({ synced: results.length, b2bResynced, nfEnriched, webhooksReprocessed, itemsEnriched, results });
}

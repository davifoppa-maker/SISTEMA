import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { ingestOrder, reprocessPendingWebhooks } from "@/lib/services/tiny";
import { runSlaAndTrackingChecks } from "@/lib/services/automation";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

// Hobby plan: 10s max. Mantemos o pedido dentro do tempo buscando 1 página
// (até 100 pedidos) por empresa, com janela de 60 dias por padrão.
export const maxDuration = 10;

function defaultDataInicial(): string {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function POST(req: Request) {
  const store = await loadStore();

  let body: unknown = null;
  try { body = await req.json(); } catch { /* sem corpo */ }

  const sp = new URL(req.url).searchParams;
  const dataInicial = sp.get("inicio") || defaultDataInicial();
  const dataFinal = sp.get("fim") || undefined;
  const empresaFilter = sp.get("empresa") || null;

  const results: { order_id: string; channel: string; empresa: string }[] = [];

  if (Array.isArray(body) && body.length > 0) {
    for (const item of body) {
      const parsed = tinyOrderSchema.parse(item);
      const order = ingestOrder(store, parsed);
      results.push({ order_id: order.id, channel: order.channel, empresa: (order as any).empresa ?? "nyer" });
    }
  } else {
    const allCompanies = [
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
        // 1 página apenas (100 pedidos) para não estourar o timeout de 10s
        const page = await fetchRecentOrders({ dataInicial, dataFinal, limit: 100, offset: 0 }, company.id);
        for (const item of page) {
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
  }

  // Reprocessa webhooks pendentes e reavalia SLA (rápido, sem API externa)
  await reprocessPendingWebhooks(store, 5).catch(() => 0);
  runSlaAndTrackingChecks(store);

  store.api_sync_logs.push({
    id: uuid(),
    source: "tiny",
    operation: "sync_recent",
    ok: true,
    detail: `${results.length} pedidos (${dataInicial} a ${dataFinal ?? "hoje"})`,
    created_at: nowIso(),
  });

  await commitStore(store);
  return ok({ synced: results.length, results });
}

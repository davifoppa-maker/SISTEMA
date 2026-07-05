import { loadStoreFor, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { ingestOrder } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";
import type { DataStore } from "@/lib/types";

export const maxDuration = 10;

function defaultDataInicial(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// Permite rodar o sync pelo navegador (GET) para diagnóstico — mesmo comportamento
// do POST. Ex.: /api/sync/tiny/recent?empresa=ecopro
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const dataInicial = sp.get("inicio") || defaultDataInicial();
    const dataFinal = sp.get("fim") || undefined;
    const empresaFilter = sp.get("empresa") || null;

    const allCompanies = [
      { id: "nyer", label: "NYER" },
      { id: "ecopro", label: "Ecopro" },
    ];
    const companies = empresaFilter
      ? allCompanies.filter((c) => c.id === empresaFilter)
      : allCompanies;

    const tables: Array<keyof DataStore> = ["orders", "customers", "invoices", "shipments", "order_items", "api_sync_logs"];

    // Carrega o store primeiro para saber quais pedidos JÁ existem (evita rebuscar
    // detalhe do que já temos — é o que estourava os 10s do Hobby).
    const store = await loadStoreFor(tables);

    const diag: Record<string, unknown> = {};
    const fetched = await Promise.all(
      companies.map(async (company) => {
        const connected = await isTinyConnected(company.id).catch(() => false);
        if (!connected) { diag[company.id] = { connected: false }; return { company: company.id, items: [] as unknown[] }; }
        // Grava direto da LISTA leve (rápido, sem buscar detalhe um a um — que
        // estoura os 10s do Hobby). Os itens entram depois pelo webhook/detalhe.
        const list = await fetchRecentOrders({ dataInicial, dataFinal, limit: 30, offset: 0 }, company.id)
          .catch((e) => { diag[`${company.id}_listErr`] = e instanceof Error ? e.message : String(e); return []; });
        diag[company.id] = {
          connected: true,
          listCount: list.length,
          primeirosNumeros: list.slice(0, 5).map((o: any) => o.numero ?? o.id),
        };
        return { company: company.id, items: list };
      }),
    );

    const results: { order_id: string; empresa: string }[] = [];
    for (const { company, items } of fetched) {
      for (const item of items) {
        try {
          const parsed = tinyOrderSchema.parse(item);
          const order = ingestOrder(store, parsed, company);
          results.push({ order_id: order.id, empresa: company });
        } catch { /* ignora pedido inválido */ }
      }
    }

    if (results.length > 0) {
      store.api_sync_logs.push({
        id: uuid(), source: "tiny", operation: "sync_recent", ok: true,
        detail: `${results.length} pedidos (${dataInicial} a ${dataFinal ?? "hoje"})`,
        created_at: nowIso(),
      });
      await commitStore(store);
    }

    return ok({ synced: results.length, results, dataInicial, diag });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Erro interno no sync", 500);
  }
}

import { loadStoreFor, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { ingestOrder } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

// Hobby plan: 10s. Carrega só as tabelas necessárias para ingestão de pedidos.
export const maxDuration = 10;

const ORDER_TABLES = [
  "orders", "customers", "invoices", "shipments",
  "order_items", "api_sync_logs",
] as const;

function defaultDataInicial(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
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

  // Busca pedidos no Tiny em paralelo com o carregamento do store
  const [fetched, store] = await Promise.all([
    Promise.all(
      companies.map(async (company) => {
        const connected = await isTinyConnected(company.id).catch(() => false);
        if (!connected) return { company: company.id, items: [] as unknown[] };
        const items = await fetchRecentOrders({ dataInicial, dataFinal, limit: 20, offset: 0 }, company.id).catch(() => []);
        return { company: company.id, items };
      })
    ),
    loadStoreFor([...ORDER_TABLES] as any),
  ]);

  const results: { order_id: string; empresa: string }[] = [];
  for (const { company, items } of fetched) {
    for (const item of items) {
      try {
        const parsed = tinyOrderSchema.parse(item);
        const order = ingestOrder(store, parsed, company);
        results.push({ order_id: order.id, empresa: company });
      } catch { /* ignora */ }
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

  return ok({ synced: results.length, results });
}

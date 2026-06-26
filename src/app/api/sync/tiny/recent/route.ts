import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { ingestOrder } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, isTinyConnected } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";

// Hobby plan: 10s. Buscamos apenas 20 pedidos recentes por empresa, sem
// nenhum enriquecimento extra (NF, rastreio, etc.). Rápido e dentro do limite.
export const maxDuration = 10;

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

  // Verifica conexão e busca pedidos em paralelo (antes de loadStore para ganhar tempo)
  const fetched: { company: string; items: unknown[] }[] = [];
  await Promise.all(
    companies.map(async (company) => {
      const connected = await isTinyConnected(company.id).catch(() => false);
      if (!connected) return;
      const page = await fetchRecentOrders({ dataInicial, dataFinal, limit: 20, offset: 0 }, company.id).catch(() => []);
      if (page.length > 0) fetched.push({ company: company.id, items: page });
    })
  );

  if (fetched.length === 0) {
    return ok({ synced: 0, results: [], note: "Nenhum pedido encontrado." });
  }

  const store = await loadStore();
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

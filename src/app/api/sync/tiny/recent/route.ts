import { loadStoreFor, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { ingestOrder } from "@/lib/services/tiny";
import { tinyOrderSchema } from "@/lib/validation/schemas";
import { fetchRecentOrders, fetchOrderById, isTinyConnected } from "@/lib/services/tiny-api";
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
    const jaExiste = (numero: string, empresa: string) =>
      store.orders.some(
        (o) => o.order_number === numero && ((o as any).empresa ?? "nyer") === empresa,
      );

    const fetched = await Promise.all(
      companies.map(async (company) => {
        const connected = await isTinyConnected(company.id).catch(() => false);
        if (!connected) return { company: company.id, items: [] as unknown[] };
        const list = await fetchRecentOrders({ dataInicial, dataFinal, limit: 20, offset: 0 }, company.id).catch(() => []);
        // Só busca o detalhe (lento) dos pedidos AINDA não gravados. Máx. 4 por vez
        // para caber no limite de 10s; rode de novo para pegar mais.
        const novos = list
          .filter((o: any) => !jaExiste(String(o.numero ?? o.id ?? ""), company.id))
          .slice(0, 4);
        const items = await Promise.all(
          novos.map((o: any) => fetchOrderById(String(o.id ?? ""), company.id).catch(() => null)),
        );
        return { company: company.id, items: items.filter(Boolean) };
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

    return ok({ synced: results.length, results });
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Erro interno no sync", 500);
  }
}

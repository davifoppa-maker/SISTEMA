import { loadStoreFor, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { fetchOrderById } from "@/lib/services/tiny-api";
import { nowIso, uuid } from "@/lib/utils/ids";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return isNaN(n) ? 0 : n;
};

// Busca os ITENS dos pedidos que ainda não têm, usando a conta (empresa) certa de
// cada pedido. Processa poucos por vez (?max, padrão 4) para caber no limite do
// Hobby — rode várias vezes até `restantes` chegar a 0.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const max = Math.min(Number(url.searchParams.get("max") ?? "4"), 10);
  const empresaFiltro = url.searchParams.get("empresa"); // opcional

  const tables: Array<keyof DataStore> = ["orders", "order_items"];
  const store = await loadStoreFor(tables);

  const semItens = store.orders.filter((o) => {
    if (!o.tiny_id) return false;
    if (empresaFiltro && ((o as any).empresa ?? "nyer") !== empresaFiltro) return false;
    return store.order_items.filter((i) => i.order_id === o.id).length === 0;
  });

  const lote = semItens.slice(0, max);
  let preenchidos = 0;
  const erros: string[] = [];

  for (const order of lote) {
    const empresa = (order as any).empresa ?? "nyer";
    try {
      const payload = await fetchOrderById(order.tiny_id!, empresa);
      const itens = payload?.itens ?? [];
      if (itens.length > 0) {
        itens.forEach((it: any) => {
          store.order_items.push({
            id: uuid(),
            order_id: order.id,
            sku: str(it.codigo),
            description: str(it.descricao) ?? "Item",
            quantity: num(it.quantidade),
            unit_value: num(it.valor_unitario),
          });
        });
        order.updated_at = nowIso();
        preenchidos++;
      } else {
        erros.push(`#${order.order_number} (${empresa}): sem itens no detalhe`);
      }
    } catch (e) {
      erros.push(`#${order.order_number} (${empresa}): ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  if (preenchidos > 0) await commitStore(store);

  return ok({
    preenchidos,
    processados: lote.length,
    restantes: semItens.length - lote.length,
    done: semItens.length - lote.length === 0,
    erros: erros.slice(0, 10),
  });
}

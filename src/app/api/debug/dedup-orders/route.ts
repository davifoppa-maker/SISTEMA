import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Remove pedidos DUPLICADOS. Chave de identidade: tiny_id + empresa (o mesmo
// pedido do Tiny não pode existir 2x na mesma empresa). Mantém 1 (o mais antigo,
// que costuma ter o histórico) e apaga os demais + seus order_items.
// ?dry=1 só mostra o que seria removido, sem apagar.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const dry = url.searchParams.get("dry") === "1";

  const store = await loadStore();

  const keyOf = (o: any) => {
    const emp = o.empresa ?? "nyer";
    // Preferir tiny_id; se faltar, cair para número+empresa.
    return o.tiny_id ? `t:${o.tiny_id}:${emp}` : `n:${o.order_number}:${emp}`;
  };

  const grupos = new Map<string, any[]>();
  for (const o of store.orders) {
    const k = keyOf(o);
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(o);
  }

  const removerIds: string[] = [];
  const detalhe: { chave: string; mantido: string; removidos: number }[] = [];
  for (const [chave, lista] of grupos) {
    if (lista.length <= 1) continue;
    // Mantém o mais antigo (menor created_at); remove o resto.
    lista.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const manter = lista[0];
    const remover = lista.slice(1);
    remover.forEach((o) => removerIds.push(o.id));
    detalhe.push({ chave, mantido: manter.order_number, removidos: remover.length });
  }

  if (!dry && removerIds.length > 0) {
    const idset = new Set(removerIds);
    store.orders = store.orders.filter((o) => !idset.has(o.id));
    store.order_items = store.order_items.filter((i) => !idset.has(i.order_id));
    // Remove também expedições/volumes órfãos dos pedidos apagados.
    const shipsToRemove = new Set(
      store.shipments.filter((s) => idset.has(s.order_id)).map((s) => s.id),
    );
    store.shipments = store.shipments.filter((s) => !idset.has(s.order_id));
    store.shipment_volumes = store.shipment_volumes.filter((v) => !shipsToRemove.has(v.shipment_id));
    store.invoices = store.invoices.filter((inv) => !idset.has(inv.order_id));
    await commitStore(store);
  }

  return ok({
    dry,
    total_pedidos_antes: store.orders.length + (dry ? 0 : removerIds.length),
    duplicados_removidos: dry ? 0 : removerIds.length,
    duplicados_encontrados: removerIds.length,
    grupos_afetados: detalhe.length,
    detalhe: detalhe.slice(0, 30),
  });
}

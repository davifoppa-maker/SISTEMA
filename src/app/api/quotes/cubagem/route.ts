import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { fetchOrderById, isTinyConnected } from "@/lib/services/tiny-api";
import { calcularCubagem, cubagemParaLinhas } from "@/lib/services/freight/cubagem";
import { uuid } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Cubagem de UM pedido (sob demanda). Lê os itens da base; se não houver (a
 * listagem do Tiny não traz itens), busca o DETALHE do pedido no Tiny — que traz
 * os itens com SKU — persiste e calcula. Cruza SKU × medidas → caixas 0–4.
 */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return fail("orderId é obrigatório", 400);

  const store = await loadStore();
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) return fail("Pedido não encontrado", 404);

  let itens = store.order_items
    .filter((i) => i.order_id === order.id)
    .map((i) => ({ sku: i.sku, descricao: i.description, quantidade: i.quantity }));

  let fonte: "base" | "tiny" | "vazio" = itens.length > 0 ? "base" : "vazio";

  // Sem itens na base → busca o detalhe no Tiny (que traz os itens) e persiste.
  if (itens.length === 0 && order.tiny_id && (await isTinyConnected().catch(() => false))) {
    const full = await fetchOrderById(order.tiny_id).catch(() => null);
    const itensTiny = full?.itens ?? [];
    if (itensTiny.length > 0) {
      for (const it of itensTiny) {
        store.order_items.push({
          id: uuid(),
          order_id: order.id,
          sku: str(it.codigo),
          description: str(it.descricao) ?? "Item",
          quantity: Number(it.quantidade) || 0,
          unit_value: Number(it.valor_unitario) || 0,
        });
      }
      await commitStore(store);
      itens = itensTiny.map((it) => ({
        sku: str(it.codigo),
        descricao: str(it.descricao) ?? "Item",
        quantidade: Number(it.quantidade) || 0,
      }));
      fonte = "tiny";
    }
  }

  const cub = calcularCubagem(itens);
  return ok({
    fonte,
    itemCount: itens.length,
    caixas: cub.caixas.map((c) => ({ nome: c.caixa.nome, quantidade: c.quantidade })),
    linhas: cubagemParaLinhas(cub),
    volumeItensM3: cub.volumeItensM3,
    semMedida: cub.semMedida,
    alertas: cub.alertas,
    totalCaixas: cub.caixas.reduce((s, c) => s + c.quantidade, 0),
  });
}

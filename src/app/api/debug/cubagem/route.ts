import { loadStoreFor } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { calcularCubagem, cubagemParaLinhas, CAIXAS } from "@/lib/services/freight/cubagem";
import { PRODUCT_MEASURES } from "@/lib/services/freight/data/product-measures";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico da cubagem de um pedido: mostra os itens, a medida de cada SKU e
// como o empacotamento distribuiu nas caixas. ?numero= ou ?orderId=
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const numero = url.searchParams.get("numero");
  const orderId = url.searchParams.get("orderId");

  const tables: Array<keyof DataStore> = ["orders", "order_items"];
  const store = await loadStoreFor(tables);
  const order = orderId
    ? store.orders.find((o) => o.id === orderId)
    : store.orders.find((o) => o.order_number === numero);
  if (!order) return fail("Pedido não encontrado", 404);

  const itensPedido = store.order_items
    .filter((i) => i.order_id === order.id)
    .map((i) => ({ sku: i.sku, descricao: i.description, quantidade: i.quantity }));

  const cub = calcularCubagem(itensPedido);

  return ok({
    pedido: order.order_number,
    empresa: (order as any).empresa ?? "nyer",
    itens: itensPedido.map((i) => ({
      ...i,
      medida: i.sku ? PRODUCT_MEASURES[i.sku] ?? null : null,
    })),
    caixasDisponiveis: CAIXAS,
    resultado: {
      caixas: cub.caixas.map((c) => ({ nome: c.caixa.nome, medida: c.caixa, quantidade: c.quantidade })),
      totalCaixas: cub.caixas.reduce((s, c) => s + c.quantidade, 0),
      volumeItensM3: cub.volumeItensM3,
      semMedida: cub.semMedida,
      alertas: cub.alertas,
    },
    linhasCotacao: cubagemParaLinhas(cub),
  });
}

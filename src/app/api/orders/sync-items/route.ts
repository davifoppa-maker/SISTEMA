import { NextResponse } from "next/server";
import { loadStore, commitStore } from "@/lib/db";
import { fetchOrderById, isTinyConnected } from "@/lib/services/tiny-api";
import { uuid, nowIso } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
};

/**
 * POST /api/orders/sync-items?orderId=xxx
 *
 * Sincroniza os itens de um pedido buscando diretamente do Tiny.
 * Se o pedido não tem itens localmente, busca no Tiny e persiste.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 });
  }

  try {
    const store = await loadStore();
    const order = store.orders.find((o) => o.id === orderId);

    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    }

    // Verifica se já tem itens
    const existingItems = store.order_items.filter((i) => i.order_id === order.id);
    if (existingItems.length > 0) {
      return NextResponse.json({
        ok: true,
        source: "local",
        itemCount: existingItems.length,
        message: "Itens já disponíveis localmente",
      });
    }

    // Tenta buscar do Tiny
    const isTinyOk = await isTinyConnected().catch(() => false);
    if (!isTinyOk || !order.tiny_id) {
      return NextResponse.json({
        ok: false,
        error: "Tiny não está configurado ou pedido não tem tiny_id",
      }, { status: 503 });
    }

    const full = await fetchOrderById(order.tiny_id).catch(() => null);
    if (!full) {
      return NextResponse.json({
        ok: false,
        error: "Não conseguiu buscar pedido no Tiny",
      }, { status: 503 });
    }

    const itensTiny = full.itens ?? [];
    if (itensTiny.length === 0) {
      return NextResponse.json({
        ok: true,
        source: "tiny",
        itemCount: 0,
        message: "Tiny retornou itens vazios para este pedido",
      });
    }

    // Persiste os itens
    for (const it of itensTiny) {
      store.order_items.push({
        id: uuid(),
        order_id: order.id,
        sku: str(it.codigo),
        description: str(it.descricao) ?? "Item",
        quantity: num(it.quantidade),
        unit_value: num(it.valor_unitario),
      });
    }

    order.updated_at = nowIso();
    await commitStore(store);

    return NextResponse.json({
      ok: true,
      source: "tiny",
      itemCount: itensTiny.length,
      message: `${itensTiny.length} item(ns) sincronizado(s) do Tiny`,
    });
  } catch (e) {
    console.error("Erro ao sincronizar itens:", e);
    return NextResponse.json(
      { error: "Erro ao sincronizar itens", details: String(e) },
      { status: 500 }
    );
  }
}

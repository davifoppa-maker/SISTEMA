import { ok, fail } from "@/lib/api";
import { loadStoreFor } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { ehCancelado, pedidoNumIgnorado } from "@/lib/pedido";
import { buildSellerCanonicalizer } from "@/lib/seller";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pente-fino: varre TODOS os pedidos e sinaliza anomalias — custo maior que a
// receita, margem muito negativa, sem itens, sem cliente vinculado, data quebrada.
//   GET /api/debug/pente-fino?k=exxdebug
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const [{ orders, customers, order_items }, catalog] = await Promise.all([
    loadStoreFor(["orders", "customers", "order_items"] as Array<keyof DataStore>),
    getCatalog(),
  ]);
  const custoDe = new Map(catalog.map((p) => [p.sku, p.cost]));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const sellerOf = buildSellerCanonicalizer(orders.map((o) => o.seller));

  const itemsByOrder = new Map<string, { sku: string | null; quantity: number; unit_value: number | null }[]>();
  for (const it of order_items as any[]) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push({ sku: it.sku, quantity: it.quantity, unit_value: it.unit_value });
    itemsByOrder.set(it.order_id, arr);
  }

  const anoOk = (d: string) => { const a = Number(d.slice(0, 4)); return a >= 2015 && a <= 2030; };

  const custoMaiorQueReceita: any[] = [];
  const semItens: any[] = [];
  const semCliente: any[] = [];
  const dataQuebrada: any[] = [];
  let ativos = 0;

  for (const o of orders) {
    if (ehCancelado(o.tiny_status) || pedidoNumIgnorado(o.order_number)) continue;
    ativos++;
    const cid = (o.customer_id ?? "").trim();
    const cliente = cid ? customerById.get(cid)?.name ?? null : null;
    const its = itemsByOrder.get(o.id) ?? [];
    let recItens = 0, custo = 0;
    for (const i of its) {
      const val = i.unit_value ?? 0;
      if (val <= 0) continue;
      recItens += val * i.quantity;
      custo += (custoDe.get(i.sku ?? "") ?? 0) * i.quantity;
    }
    const receita = (o.total_value ?? 0) > 0 ? (o.total_value as number) : recItens;
    const base = {
      pedido: o.order_number,
      cliente: cliente ?? "(sem vínculo)",
      vendedor: sellerOf(o.seller),
      data: (o.order_date ?? "").slice(0, 10),
      receita: Math.round(receita),
      custo: Math.round(custo),
      margemPct: receita > 0 ? Math.round(((receita - custo) / receita) * 100) : null,
    };

    if (custo > receita && receita > 0) custoMaiorQueReceita.push(base);
    if (its.length === 0) semItens.push({ pedido: o.order_number, cliente: base.cliente, total: Math.round(o.total_value ?? 0) });
    if (!cid || !customerById.has(cid)) semCliente.push({ pedido: o.order_number, vendedor: base.vendedor, motivo: !cid ? "sem_customer_id" : "customer_id_inexistente" });
    const dia = (o.order_date ?? "").slice(0, 10);
    if (dia.length !== 10 || !anoOk(dia)) dataQuebrada.push({ pedido: o.order_number, data: o.order_date });
  }

  custoMaiorQueReceita.sort((a, b) => (a.margemPct ?? 0) - (b.margemPct ?? 0));

  return ok({
    resumo: {
      pedidos_ativos: ativos,
      custo_maior_que_receita: custoMaiorQueReceita.length,
      sem_itens: semItens.length,
      sem_cliente_vinculado: semCliente.length,
      data_quebrada: dataQuebrada.length,
    },
    custo_maior_que_receita: custoMaiorQueReceita.slice(0, 60),
    sem_itens: semItens.slice(0, 40),
    sem_cliente_vinculado: semCliente.slice(0, 40),
    data_quebrada: dataQuebrada.slice(0, 40),
  });
}

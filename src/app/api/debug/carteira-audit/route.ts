import { ok, fail } from "@/lib/api";
import { loadStoreFor } from "@/lib/db";
import { ehCancelado, pedidoNumIgnorado } from "@/lib/pedido";
import { buildSellerCanonicalizer } from "@/lib/seller";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Auditoria da carteira de clientes: quantos pedidos ficam de fora da base por
// falta de vínculo com cliente, e a carteira por vendedor.
//   GET /api/debug/carteira-audit?k=exxdebug
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const tables: Array<keyof DataStore> = ["orders", "customers"];
  const store = await loadStoreFor(tables);
  const customerById = new Map(store.customers.map((c) => [c.id, c]));
  const sellerOf = buildSellerCanonicalizer(store.orders.map((o) => o.seller));

  let semCustomerId = 0;           // pedido sem customer_id
  let customerIdOrfao = 0;         // tem customer_id mas não existe na tabela clientes
  let ok_vinculado = 0;
  let cancelados = 0, ignorados = 0;
  const carteiraPorVendedor = new Map<string, Set<string>>();
  const carteiraGlobal = new Set<string>();
  const semVinculoAmostra: { pedido: string; vendedor: string; total: number; motivo: string }[] = [];

  for (const o of store.orders) {
    if (ehCancelado(o.tiny_status)) { cancelados++; continue; }
    if (pedidoNumIgnorado(o.order_number)) { ignorados++; continue; }
    const cid = (o.customer_id ?? "").trim();
    const vend = sellerOf(o.seller);
    if (!cid) {
      semCustomerId++;
      if (semVinculoAmostra.length < 30) semVinculoAmostra.push({ pedido: o.order_number, vendedor: vend, total: Math.round(o.total_value ?? 0), motivo: "sem_customer_id" });
      continue;
    }
    if (!customerById.has(cid)) {
      customerIdOrfao++;
      if (semVinculoAmostra.length < 30) semVinculoAmostra.push({ pedido: o.order_number, vendedor: vend, total: Math.round(o.total_value ?? 0), motivo: "customer_id_inexistente" });
      continue;
    }
    ok_vinculado++;
    carteiraGlobal.add(cid);
    if (!carteiraPorVendedor.has(vend)) carteiraPorVendedor.set(vend, new Set());
    carteiraPorVendedor.get(vend)!.add(cid);
  }

  // Clientes na base SEM nenhum pedido vinculado.
  const clientesComPedido = new Set(store.orders.map((o) => (o.customer_id ?? "").trim()).filter(Boolean));
  const clientesSemPedido = store.customers.filter((c) => !clientesComPedido.has(c.id)).length;

  const perVendedor = [...carteiraPorVendedor.entries()]
    .map(([nome, set]) => ({ vendedor: nome, carteira: set.size }))
    .sort((a, b) => b.carteira - a.carteira);

  return ok({
    totais: {
      pedidos: store.orders.length,
      clientes_na_base: store.customers.length,
      pedidos_vinculados: ok_vinculado,
      pedidos_SEM_customer_id: semCustomerId,
      pedidos_com_customer_id_INEXISTENTE: customerIdOrfao,
      pedidos_cancelados: cancelados,
      pedidos_ignorados: ignorados,
      carteira_global_distinta: carteiraGlobal.size,
      clientes_na_base_SEM_pedido: clientesSemPedido,
    },
    diagnostico:
      semCustomerId + customerIdOrfao > 0
        ? `${semCustomerId + customerIdOrfao} pedido(s) ficam FORA da carteira por falta de vínculo com cliente — é a causa da positivação incompleta.`
        : "Todos os pedidos válidos estão vinculados a um cliente.",
    carteira_por_vendedor: perVendedor,
    amostra_pedidos_sem_vinculo: semVinculoAmostra,
  });
}

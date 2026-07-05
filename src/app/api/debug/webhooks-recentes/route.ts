import { loadStoreFor } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import type { DataStore } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Diagnóstico SÓ-LEITURA: mostra os últimos eventos de webhook e logs de sync,
// para conferir se pedidos/NF das duas empresas estão chegando.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const tables: Array<keyof DataStore> = ["webhook_events", "api_sync_logs", "orders"];
  const store = await loadStoreFor(tables);

  const eventos = [...store.webhook_events]
    .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
    .slice(0, 20)
    .map((e) => ({
      tipo: e.event_type,
      status: e.status,
      erro: e.error_message ?? null,
      criado: e.received_at,
    }));

  const logs = [...store.api_sync_logs]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 20)
    .map((l) => ({ op: l.operation, ok: l.ok, detalhe: l.detail, criado: l.created_at }));

  // Contagem de pedidos por empresa.
  const porEmpresa: Record<string, number> = {};
  for (const o of store.orders) {
    const emp = (o as any).empresa ?? "nyer";
    porEmpresa[emp] = (porEmpresa[emp] ?? 0) + 1;
  }

  const ultimosPedidos = [...store.orders]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10)
    .map((o) => ({
      numero: o.order_number,
      empresa: (o as any).empresa ?? "nyer",
      status: o.tiny_status,
      criado: o.created_at,
    }));

  return ok({ total_pedidos: store.orders.length, porEmpresa, ultimosPedidos, eventos, logs });
}

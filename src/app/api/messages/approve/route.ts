import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { dispatchMessageLog } from "@/lib/services/whatsapp";
import { fetchNfDocLink, fetchOrderById } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Telefone considerado válido: ao menos 10 dígitos (DDD + número).
function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

// Aprova e dispara uma mensagem da fila (com a NF em PDF anexada, se houver).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string; content?: string; phone?: string };
  if (!body.id) return fail("id é obrigatório", 400);

  const store = await loadStore();
  const log = store.message_logs.find((m) => m.id === body.id);
  if (!log) return fail("Mensagem não encontrada", 404);
  if (log.status !== "queued") return fail("Mensagem já foi tratada", 409);

  // Cliente da mensagem (ou do pedido) — usado como fallback de telefone e p/ a NF.
  const order = log.order_id ? store.orders.find((o) => o.id === log.order_id) : null;
  const customer =
    (log.customer_id ? store.customers.find((c) => c.id === log.customer_id) : null) ??
    (order?.customer_id ? store.customers.find((c) => c.id === order.customer_id) : null);

  // Telefone: o digitado na fila tem prioridade; senão o do registro; depois o
  // do cadastro atual do cliente (caso o snapshot da mensagem tenha vindo vazio).
  let phone =
    normalizePhone(body.phone) ??
    normalizePhone(log.phone) ??
    normalizePhone(customer?.whatsapp_phone) ??
    normalizePhone(customer?.phone);

  // Último recurso: busca o telefone direto no pedido do Tiny (fonte autoritativa)
  // e já corrige o cadastro do cliente, para as próximas vezes não vir vazio.
  if (!phone && order?.tiny_id) {
    const full = await fetchOrderById(order.tiny_id).catch(() => null);
    phone = normalizePhone(full?.cliente?.fone);
    if (phone && customer) {
      if (!normalizePhone(customer.phone)) customer.phone = phone;
      if (!normalizePhone(customer.whatsapp_phone)) customer.whatsapp_phone = phone;
    }
  }

  if (!phone) {
    // Sem contato válido: NÃO envia e mantém na fila para reenvio depois que a
    // Bárbara cadastrar o telefone do cliente (ou digitar um aqui).
    return ok({
      status: "queued",
      error: "Cliente sem telefone válido. Cadastre o contato no cliente (ou digite um número aqui) e reenvie.",
    });
  }

  log.phone = phone;

  // Anexa a NF do pedido, se existir: o Tiny só fornece a DANFE como página
  // (sem PDF pela API), então enviamos o link — o cliente abre/salva a NF.
  let mediaUrl: string | null = null;
  if (order?.tiny_id) {
    mediaUrl = await fetchNfDocLink(order.tiny_id).catch(() => null);
  }

  await dispatchMessageLog(log, { content: body.content, mediaUrl });
  await commitStore(store);

  return ok({ status: log.status, attachedNf: Boolean(mediaUrl), error: log.error_message });
}

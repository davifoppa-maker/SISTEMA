import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { sendMessage } from "@/lib/services/whatsapp";
import { fetchNfDocLink } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Envia a nota fiscal (link do DANFE) de um pedido pelo WhatsApp do cliente.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { order_id?: string };
  if (!body.order_id) return fail("order_id é obrigatório", 400);

  const store = await loadStore();
  const order = store.orders.find((o) => o.id === body.order_id);
  if (!order) return fail("Pedido não encontrado", 404);

  const customer = store.customers.find((c) => c.id === order.customer_id);
  const phone = customer?.whatsapp_phone || customer?.phone;
  if (!phone) return fail("Cliente sem telefone/WhatsApp cadastrado", 422);

  if (!order.tiny_id) return fail("Pedido sem vínculo no Tiny", 422);
  const link = await fetchNfDocLink(order.tiny_id).catch(() => null);
  if (!link) return fail("Não foi possível obter a nota fiscal deste pedido (NF emitida?)", 404);

  const content = `Olá${customer?.name ? ` ${customer.name.split(" ")[0]}` : ""}! Segue a nota fiscal do seu pedido #${order.order_number}: ${link}`;
  const log = await sendMessage(store, {
    order_id: order.id,
    customer_id: customer?.id ?? null,
    phone,
    content,
  });
  await commitStore(store);

  return ok({ status: log.status, phone, link });
}

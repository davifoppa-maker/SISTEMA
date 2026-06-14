import { loadStore, commitStore } from "@/lib/db";
import { ok } from "@/lib/api";
import { nowIso, uuid } from "@/lib/utils/ids";
import type { MessageLog } from "@/lib/types";

// Verificação do webhook (Meta envia GET com hub.challenge).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === (process.env.META_WHATSAPP_VERIFY_TOKEN ?? "exx-verify-token")) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

// Recebe status de mensagens e mensagens recebidas (opt-out / respostas).
export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const store = await loadStore();

  // sempre salva o evento bruto
  store.webhook_events.push({
    id: uuid(),
    source: "meta",
    event_type: "whatsapp",
    external_id: null,
    idempotency_key: `meta:${uuid()}`,
    payload,
    status: "received",
    received_at: nowIso(),
    processed_at: nowIso(),
    error_message: null,
  });

  // processa status updates e mensagens recebidas (estrutura padrão da Cloud API)
  try {
    const entries = (payload as any)?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const status of value.statuses ?? []) {
          const log = store.message_logs.find((m) => m.provider_message_id === status.id);
          if (log) applyStatus(log, status.status);
        }
        for (const msg of value.messages ?? []) {
          store.message_logs.push({
            id: uuid(),
            order_id: null,
            customer_id: null,
            template_id: null,
            trigger_key: null,
            phone: msg.from ?? null,
            direction: "inbound",
            content: msg.text?.body ?? "",
            provider_message_id: msg.id ?? null,
            status: "delivered",
            sent_at: null,
            delivered_at: nowIso(),
            read_at: null,
            error_message: null,
            created_at: nowIso(),
          });
        }
      }
    }
  } catch {
    /* tolerante a formatos */
  }

  await commitStore(store);
  return ok({ received: true });
}

function applyStatus(log: MessageLog, status: string) {
  if (status === "sent") log.status = "sent";
  if (status === "delivered") {
    log.status = "delivered";
    log.delivered_at = nowIso();
  }
  if (status === "read") {
    log.status = "read";
    log.read_at = nowIso();
  }
  if (status === "failed") log.status = "failed";
}

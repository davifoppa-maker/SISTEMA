import type { DataStore, MessageLog } from "@/lib/types";
import { nowIso, uuid } from "@/lib/utils/ids";

const OPT_OUT_WORDS = ["parar", "sair", "não quero", "nao quero", "cancelar", "stop"];

export interface SendMessageInput {
  order_id?: string | null;
  customer_id?: string | null;
  phone: string;
  content: string;
  template_id?: string | null;
  trigger_key?: string | null;
  media_url?: string | null;
}

/**
 * Serviço de WhatsApp. No MVP opera em modo MOCK: registra a mensagem em
 * message_logs com status "sent" sem chamar a Meta Cloud API. Quando
 * META_WHATSAPP_TOKEN estiver configurado, sendViaMeta() é usado.
 *
 * Garante idempotência por gatilho: não reenvia a mesma trigger para o mesmo
 * pedido (evita duplicidade conforme cap. 5.9 da spec).
 */
export function isOptedOut(store: DataStore, phone: string): boolean {
  return store.message_logs.some(
    (m) =>
      m.phone === phone &&
      m.direction === "inbound" &&
      OPT_OUT_WORDS.some((w) => m.content.toLowerCase().includes(w)),
  );
}

export function alreadySentTrigger(
  store: DataStore,
  orderId: string | null | undefined,
  triggerKey: string | null | undefined,
): boolean {
  if (!orderId || !triggerKey) return false;
  return store.message_logs.some(
    (m) =>
      m.order_id === orderId &&
      m.trigger_key === triggerKey &&
      m.direction === "outbound" &&
      m.status !== "failed",
  );
}

export async function sendMessage(
  store: DataStore,
  input: SendMessageInput,
): Promise<MessageLog> {
  // opt-out
  if (isOptedOut(store, input.phone)) {
    const blocked: MessageLog = baseLog(input, "opted_out");
    blocked.error_message = "Cliente optou por não receber mensagens.";
    store.message_logs.push(blocked);
    return blocked;
  }

  // idempotência por gatilho
  if (alreadySentTrigger(store, input.order_id, input.trigger_key)) {
    const existing = store.message_logs.find(
      (m) =>
        m.order_id === input.order_id &&
        m.trigger_key === input.trigger_key &&
        m.direction === "outbound",
    );
    if (existing) return existing;
  }

  const log = baseLog(input, "queued");

  try {
    log.provider_message_id = await deliverWhatsApp(input);
    log.status = "sent";
    log.sent_at = nowIso();
  } catch (err) {
    log.status = "failed";
    log.error_message = err instanceof Error ? err.message : "erro desconhecido";
  }

  store.message_logs.push(log);
  return log;
}

/**
 * Cria uma mensagem na FILA DE APROVAÇÃO (status "queued"), sem enviar. Usada
 * quando um gatilho (ex.: expedição coletada) prepara a mensagem para a Bárbara
 * revisar e aprovar manualmente na aba WhatsApp.
 */
export function queueMessage(store: DataStore, input: SendMessageInput): MessageLog {
  if (isOptedOut(store, input.phone)) {
    const blocked = baseLog(input, "opted_out");
    blocked.error_message = "Cliente optou por não receber mensagens.";
    store.message_logs.push(blocked);
    return blocked;
  }
  if (alreadySentTrigger(store, input.order_id, input.trigger_key)) {
    const existing = store.message_logs.find(
      (m) => m.order_id === input.order_id && m.trigger_key === input.trigger_key && m.direction === "outbound",
    );
    if (existing) return existing;
  }
  const log = baseLog(input, "queued");
  store.message_logs.push(log);
  return log;
}

/** Dispara uma mensagem já existente (aprovação da fila), opcionalmente com anexo. */
export async function dispatchMessageLog(
  log: MessageLog,
  opts: { content?: string; mediaUrl?: string | null } = {},
): Promise<MessageLog> {
  if (opts.content) log.content = opts.content;
  try {
    log.provider_message_id = await deliverWhatsApp({
      phone: log.phone ?? "",
      content: log.content,
      media_url: opts.mediaUrl ?? null,
    });
    log.status = "sent";
    log.sent_at = nowIso();
    log.error_message = null;
  } catch (err) {
    log.status = "failed";
    log.error_message = err instanceof Error ? err.message : "erro desconhecido";
  }
  return log;
}

/** Entrega a mensagem pelo provedor configurado (worker WhatsApp Web / Meta / mock). */
async function deliverWhatsApp(input: { phone: string; content: string; media_url?: string | null }): Promise<string> {
  if (process.env.WHATSAPP_WORKER_URL) return sendViaWorker(input);
  if (process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID) {
    return sendViaMeta(input);
  }
  return `mock-${uuid()}`;
}

function baseLog(input: SendMessageInput, status: MessageLog["status"]): MessageLog {
  return {
    id: uuid(),
    order_id: input.order_id ?? null,
    customer_id: input.customer_id ?? null,
    template_id: input.template_id ?? null,
    trigger_key: input.trigger_key ?? null,
    phone: input.phone,
    direction: "outbound",
    content: input.content,
    provider_message_id: null,
    status,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    error_message: null,
    created_at: nowIso(),
  };
}

async function sendViaMeta(input: { phone: string; content: string }): Promise<string> {
  const url = `https://graph.facebook.com/v20.0/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: input.phone,
      type: "text",
      text: { body: input.content },
    }),
  });
  if (!res.ok) {
    throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? "unknown";
}

// Envia via worker do WhatsApp Web (Baileys). Suporta anexo opcional (PDF da NF).
async function sendViaWorker(input: { phone: string; content: string; media_url?: string | null }): Promise<string> {
  const base = process.env.WHATSAPP_WORKER_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-worker-token": process.env.WHATSAPP_WORKER_TOKEN ?? "",
    },
    body: JSON.stringify({
      to: input.phone,
      message: input.content,
      media_url: input.media_url ?? null,
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `Worker WhatsApp ${res.status}`);
  }
  return data.id ?? "whatsapp-web";
}

/** Renderiza um template substituindo {{var}} pelos valores fornecidos. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

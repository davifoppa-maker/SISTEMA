import type { Carrier, DataStore, Order, Shipment } from "@/lib/types";
import { nowIso, uuid } from "@/lib/utils/ids";
import { startDeliverySla, refreshSlaStatuses } from "@/lib/services/sla";
import { renderTemplate, queueMessage } from "@/lib/services/whatsapp";
import { getAdapter } from "@/lib/services/carrier";
import { resolveOrCreateCarrier, isPickupCarrier } from "@/lib/services/tiny";
import { providerIdForCarrierName } from "@/lib/services/freight/registry";

// Transportadoras com rastreio por API: para elas, atraso é fato (vira alerta).
// Sem rastreio (Lenoir/manual), em vez de "atrasado" perguntamos ao cliente.
const AUTO_TRACKED = new Set(["arlete", "jadlog"]);

// Margem após a previsão de entrega antes de perguntar ao cliente (sem rastreio):
// espera 1 dia para não incomodar quem recebeu exatamente no prazo.
const CONFIRM_MARGIN_HOURS = 24;

/**
 * Sem rastreio (Lenoir/manual): ao atingir a previsão de entrega, pergunta ao
 * cliente se recebeu (WhatsApp na fila de aprovação) e abre uma tarefa/alerta de
 * acompanhamento. Não marca "entregue" nem "atrasado" sozinho — o operador baixa
 * conforme a resposta. Idempotente por pedido.
 */
function askDeliveryConfirmation(store: DataStore, order: Order, shipment: Shipment, carrier: Carrier | undefined, now: string): void {
  const hasTask = store.customer_tasks.some(
    (t) => t.order_id === order.id && t.type === "confirmar_entrega" && t.status === "pendente",
  );
  if (hasTask) return;

  const carrierName = carrier?.name ?? order.carrier_name ?? "transportadora";
  store.customer_tasks.push({
    id: uuid(),
    customer_id: order.customer_id,
    order_id: order.id,
    type: "confirmar_entrega",
    title: `Confirmar entrega do pedido #${order.order_number} (${carrierName})`,
    description: "Transportadora sem rastreio: confirmar com o cliente se recebeu a mercadoria.",
    due_at: null,
    status: "pendente",
    assigned_user_id: null,
    created_at: now,
  });
  store.alerts.push({
    id: uuid(),
    order_id: order.id,
    shipment_id: shipment.id,
    type: "pendencia",
    message: `Pedido #${order.order_number} (${carrierName}): previsão de entrega atingida — confirmar recebimento com o cliente.`,
    resolved: false,
    created_at: now,
  });

  const customer = store.customers.find((c) => c.id === order.customer_id);
  const phone = customer?.whatsapp_phone || customer?.phone || "";
  if (phone) {
    queueMessage(store, {
      order_id: order.id,
      customer_id: customer?.id ?? null,
      phone,
      content: `Olá${customer?.name ? `, ${customer.name}` : ""}! Aqui é da NYER. Seu pedido #${order.order_number} foi enviado pela ${carrierName} e a previsão de entrega já passou. Você já recebeu tudo certinho? Se sim, responda "recebi"; se houve algum problema, conte aqui que a gente resolve. 🙏`,
      trigger_key: "CONFIRMAR_ENTREGA",
    });
  }
}

export interface FinalizeCheckoutInput {
  shipment_id: string;
  scanned_codes: string[];
  carrier_id?: string | null;
  carrier_name?: string | null;
  collector_name?: string | null;
  collector_document?: string | null;
  vehicle_plate?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  user_id?: string | null;
}

interface CollectionContext {
  carrierId: string;
  carrier: Carrier | undefined;
  pickup: boolean;
  collectedAt: string;
  batchId: string | null;
  photoUrl: string | null;
  userId: string | null;
}

/**
 * Registra a coleta de UMA expedição: volumes bipados (1 por código), status,
 * SLA, lote (compartilhado) e WhatsApp. Para retirada no CD vai direto a
 * "entregue" (sem lote/SLA). Usado pelo checkout single e em lote.
 */
function recordCollection(store: DataStore, shipment: Shipment, codes: string[], ctx: CollectionContext): void {
  codes.forEach((code, i) => {
    const volumeId = uuid();
    store.shipment_volumes.push({
      id: volumeId,
      shipment_id: shipment.id,
      volume_number: i + 1,
      barcode: code,
      weight: null,
      height: null,
      width: null,
      length: null,
      expected: true,
      scanned: true,
      scanned_at: ctx.collectedAt,
      photo_url: ctx.photoUrl,
    });
    store.checkout_scans.push({
      id: uuid(),
      shipment_id: shipment.id,
      volume_id: volumeId,
      scanned_code: code,
      scan_type: "volume",
      user_id: ctx.userId,
      scanned_at: ctx.collectedAt,
      notes: null,
    });
  });

  shipment.carrier_id = ctx.carrierId;
  shipment.real_collected_at = ctx.collectedAt;
  shipment.updated_at = ctx.collectedAt;

  const order = store.orders.find((o) => o.id === shipment.order_id);

  if (ctx.pickup) {
    shipment.status = "entregue";
    shipment.delivered_at = ctx.collectedAt;
    if (order) {
      order.logistic_status = "entregue";
      order.updated_at = ctx.collectedAt;
    }
    store.audit_logs.push({
      id: uuid(),
      entity: "shipment",
      entity_id: shipment.id,
      action: "EXPEDICAO_RETIRADA",
      detail: `retirada pelo cliente no CD ${ctx.collectedAt}`,
      user_id: ctx.userId,
      created_at: ctx.collectedAt,
    });
    return;
  }

  shipment.batch_id = ctx.batchId;
  shipment.status = "coletado";
  if (!shipment.tracking_code) {
    shipment.tracking_code = `EXX${shipment.id.slice(0, 8).toUpperCase()}`;
  }
  if (ctx.carrier) {
    shipment.tracking_url = getAdapter(ctx.carrier.mode).buildTrackingUrl(ctx.carrier, shipment);
  }
  if (order) {
    order.logistic_status = "coletado";
    order.updated_at = ctx.collectedAt;
  }
  if (ctx.carrier) {
    startDeliverySla(store, shipment, ctx.carrier.default_sla_days, order?.expected_delivery_at ?? null);
  }
  store.audit_logs.push({
    id: uuid(),
    entity: "shipment",
    entity_id: shipment.id,
    action: "EXPEDICAO_COLETADA",
    detail: `coleta real ${ctx.collectedAt}, transportadora ${ctx.carrier?.name ?? "?"}`,
    user_id: ctx.userId,
    created_at: ctx.collectedAt,
  });

  // WhatsApp de expedição na fila de aprovação (não envia sozinho).
  const rule = store.automation_rules.find((r) => r.key === "coleta_confirmada");
  if (rule?.active && rule.config.send_whatsapp && order) {
    const customer = store.customers.find((c) => c.id === order.customer_id);
    const template = store.message_templates.find((t) => t.key === "pedido_coletado");
    const phone = customer?.whatsapp_phone || customer?.phone || "";
    if (template) {
      const content = renderTemplate(template.body, {
        cliente_nome: customer?.name ?? "cliente",
        transportadora: ctx.carrier?.name ?? "transportadora",
        link_rastreio: shipment.tracking_url ?? "consulte por NF/CNPJ",
      });
      queueMessage(store, {
        order_id: order.id,
        customer_id: customer?.id ?? null,
        phone,
        content,
        template_id: template.id,
        trigger_key: "EXPEDICAO_COLETADA",
      });
    }
  }
}

export interface CheckoutBatchItem {
  shipment_id: string;
  scanned_codes: string[];
}
export interface FinalizeCheckoutBatchInput {
  items: CheckoutBatchItem[];
  carrier_id?: string | null;
  carrier_name?: string | null;
  collector_name?: string | null;
  collector_document?: string | null;
  vehicle_plate?: string | null;
  photo_url?: string | null;
  notes?: string | null;
  user_id?: string | null;
}

/**
 * Finaliza a coleta de VÁRIOS pedidos da MESMA transportadora num único lote/
 * romaneio (checkout em lote). Cada pedido recebe seus volumes bipados.
 */
export async function finalizeCheckoutBatch(
  store: DataStore,
  input: FinalizeCheckoutBatchInput,
): Promise<{ shipmentIds: string[]; pickup: boolean; carrierName: string | null }> {
  const items = input.items
    .map((it) => ({ shipment_id: it.shipment_id, codes: it.scanned_codes.map((c) => c.trim()).filter(Boolean) }))
    .filter((it) => it.codes.length > 0);
  if (items.length === 0) throw new Error("Bipe ao menos 1 volume antes de finalizar.");

  const carrierId = input.carrier_id || resolveOrCreateCarrier(store, input.carrier_name ?? null);
  if (!carrierId) throw new Error("Transportadora não definida.");
  const carrier = store.carriers.find((c) => c.id === carrierId);
  const pickup = isPickupCarrier(carrier?.name ?? input.carrier_name ?? null);
  const collectedAt = nowIso();

  // Um único lote para todos os pedidos da transportadora (retirada não cria lote).
  let batchId: string | null = null;
  if (!pickup) {
    const batch = {
      id: uuid(),
      carrier_id: carrierId,
      collector_name: input.collector_name ?? null,
      collector_document: input.collector_document ?? null,
      vehicle_plate: input.vehicle_plate ?? null,
      collected_at: collectedAt,
      closed_by_user_id: input.user_id ?? null,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      created_at: collectedAt,
    };
    store.shipping_batches.push(batch);
    batchId = batch.id;
  }

  const ctx: CollectionContext = {
    carrierId,
    carrier,
    pickup,
    collectedAt,
    batchId,
    photoUrl: input.photo_url ?? null,
    userId: input.user_id ?? null,
  };

  const shipmentIds: string[] = [];
  for (const it of items) {
    const shipment = store.shipments.find((s) => s.id === it.shipment_id);
    if (!shipment) continue;
    recordCollection(store, shipment, it.codes, ctx);
    shipmentIds.push(shipment.id);
  }

  return { shipmentIds, pickup, carrierName: carrier?.name ?? input.carrier_name ?? null };
}

/**
 * Finaliza a coleta de UM pedido (compatibilidade) — delega ao checkout em lote.
 */
export async function finalizeCheckout(
  store: DataStore,
  input: FinalizeCheckoutInput,
): Promise<{ shipment: Shipment }> {
  const shipment = store.shipments.find((s) => s.id === input.shipment_id);
  if (!shipment) throw new Error("Expedição não encontrada.");
  const codes = input.scanned_codes.map((c) => c.trim()).filter(Boolean);
  if (codes.length < 1) throw new Error("Bipe ao menos 1 volume antes de finalizar.");

  await finalizeCheckoutBatch(store, {
    items: [{ shipment_id: input.shipment_id, scanned_codes: codes }],
    carrier_id: input.carrier_id,
    carrier_name: input.carrier_name,
    collector_name: input.collector_name,
    collector_document: input.collector_document,
    vehicle_plate: input.vehicle_plate,
    photo_url: input.photo_url,
    notes: input.notes,
    user_id: input.user_id,
  });

  return { shipment };
}

/**
 * Job de verificação de SLA e rastreio. Reavalia SLAs e cria alertas/ocorrências:
 * - sem_rastreio: coletado há > X horas sem evento de rastreio
 * - em_risco: SLA em risco (alerta amarelo) sem ocorrência
 * - atrasado: SLA vencido → alerta + ocorrência interna (NÃO notifica cliente)
 * Idempotente: não duplica alertas/ocorrências abertas para o mesmo shipment.
 */
export function runSlaAndTrackingChecks(store: DataStore, nowOverride?: string): {
  alertsCreated: number;
  occurrencesCreated: number;
} {
  refreshSlaStatuses(store, nowOverride);
  const now = nowOverride ?? nowIso();
  let alertsCreated = 0;
  let occurrencesCreated = 0;

  const hasOpenAlert = (shipmentId: string, type: string) =>
    store.alerts.some((a) => a.shipment_id === shipmentId && a.type === type && !a.resolved);
  const hasOpenOccurrence = (orderId: string | null, type: string) =>
    store.occurrences.some((o) => o.order_id === orderId && o.type === type && o.status !== "resolvida");

  const trackingRule = store.automation_rules.find((r) => r.key === "sem_rastreio");
  const trackingHours = Number(trackingRule?.config.hours ?? 24);

  for (const shipment of store.shipments) {
    if (!shipment.real_collected_at || shipment.delivered_at) continue;

    const carrier = store.carriers.find((c) => c.id === shipment.carrier_id);

    // RETIRADA no CD: nunca tem atraso. Se foi bipada (coletada), o cliente já
    // retirou → marca ENTREGUE e limpa qualquer atraso/alerta gerado antes.
    if (isPickupCarrier(carrier?.name)) {
      shipment.delivered_at = shipment.real_collected_at;
      shipment.status = "entregue";
      shipment.updated_at = now;
      const ord = store.orders.find((o) => o.id === shipment.order_id);
      if (ord && ord.logistic_status !== "entregue") {
        ord.logistic_status = "entregue";
        ord.updated_at = now;
      }
      for (const a of store.alerts) {
        if (a.shipment_id === shipment.id && !a.resolved) a.resolved = true;
      }
      for (const o of store.occurrences) {
        if (o.shipment_id === shipment.id && o.type === "atraso" && o.status !== "resolvida") {
          o.status = "resolvida";
          o.resolved_at = now;
        }
      }
      store.sla_records = store.sla_records.filter((s) => s.shipment_id !== shipment.id);
      continue;
    }

    // sem rastreio — só vale para transportadoras que TÊM rastreio configurado.
    // "Tem rastreio" = já existe um CÓDIGO de rastreio (ex.: Correios/Jadlog/J&T)
    // OU já chegou algum evento de movimentação.
    const carrierHasTracking = Boolean(carrier?.tracking_url_template);
    const hasTracking =
      Boolean(shipment.tracking_code) ||
      store.carrier_tracking_events.some((t) => t.shipment_id === shipment.id);
    // Se passou a ter rastreio, resolve qualquer alerta "sem rastreio" anterior.
    if (hasTracking) {
      for (const a of store.alerts) {
        if (a.shipment_id === shipment.id && a.type === "sem_rastreio" && !a.resolved) a.resolved = true;
      }
    }
    const hoursSinceCollect =
      (new Date(now).getTime() - new Date(shipment.real_collected_at).getTime()) / 3600000;
    if (carrierHasTracking && !hasTracking && hoursSinceCollect > trackingHours && !hasOpenAlert(shipment.id, "sem_rastreio")) {
      store.alerts.push({
        id: uuid(),
        order_id: shipment.order_id,
        shipment_id: shipment.id,
        type: "sem_rastreio",
        message: `Sem rastreio há ${Math.round(hoursSinceCollect)}h após a coleta.`,
        resolved: false,
        created_at: now,
      });
      alertsCreated++;
    }

    const sla = store.sla_records.find(
      (s) => s.shipment_id === shipment.id && s.sla_type === "coleta_entrega",
    );
    if (!sla) continue;

    if (sla.status === "em_risco" && !hasOpenAlert(shipment.id, "em_risco")) {
      store.alerts.push({
        id: uuid(),
        order_id: shipment.order_id,
        shipment_id: shipment.id,
        type: "em_risco",
        message: "Entrega em risco: previsão próxima sem movimentação suficiente.",
        resolved: false,
        created_at: now,
      });
      alertsCreated++;
    }

    if (sla.status === "atrasado") {
      const order = store.orders.find((o) => o.id === shipment.order_id);
      const providerId = providerIdForCarrierName(carrier?.name ?? order?.carrier_name ?? null);
      const autoTracked = providerId ? AUTO_TRACKED.has(providerId) : false;

      if (!autoTracked) {
        // Sem rastreio (Lenoir/manual): nunca vira "atrasado". Após 1 dia de
        // margem do prazo, pergunta ao cliente (mensagem na fila de aprovação).
        const deadlineMs = sla.deadline_at ? new Date(sla.deadline_at).getTime() : null;
        const hoursPastDeadline = deadlineMs ? (new Date(now).getTime() - deadlineMs) / 3600000 : 0;
        if (order && order.logistic_status !== "entregue" && hoursPastDeadline >= CONFIRM_MARGIN_HOURS) {
          askDeliveryConfirmation(store, order, shipment, carrier, now);
        }
        continue;
      }

      if (order && order.logistic_status !== "entregue") {
        order.logistic_status = "atrasado";
      }
      if (!hasOpenAlert(shipment.id, "atrasado")) {
        store.alerts.push({
          id: uuid(),
          order_id: shipment.order_id,
          shipment_id: shipment.id,
          type: "atrasado",
          message: "Pedido ultrapassou a data limite de entrega.",
          resolved: false,
          created_at: now,
        });
        alertsCreated++;
      }
      // atraso gera ocorrência INTERNA por padrão (não notifica cliente)
      if (!hasOpenOccurrence(shipment.order_id, "atraso")) {
        store.occurrences.push({
          id: uuid(),
          order_id: shipment.order_id,
          shipment_id: shipment.id,
          carrier_id: shipment.carrier_id,
          type: "atraso",
          severity: "alta",
          status: "aberta",
          description: "Atraso detectado automaticamente pelo SLA.",
          responsible_user_id: null,
          opened_at: now,
          resolved_at: null,
        });
        occurrencesCreated++;
      }
    }
  }

  return { alertsCreated, occurrencesCreated };
}

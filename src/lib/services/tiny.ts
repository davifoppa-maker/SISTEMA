import type {
  Carrier,
  Customer,
  DataStore,
  Invoice,
  Order,
  Shipment,
  WebhookEvent,
} from "@/lib/types";
import type { TinyInvoicePayload, TinyOrderPayload } from "@/lib/validation/schemas";
import { nowIso, uuid } from "@/lib/utils/ids";
import { detectChannel } from "@/lib/services/channel";
import { fetchOrderNF, fetchOrderById } from "@/lib/services/tiny-api";
import { createHash } from "node:crypto";

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

/** Gera idempotency_key estável a partir de origem + tipo + payload. */
export function idempotencyKey(source: string, eventType: string, payload: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ source, eventType, payload }))
    .digest("hex");
  return `${source}:${eventType}:${hash.slice(0, 16)}`;
}

/**
 * Registra o webhook bruto com idempotência. Retorna { event, duplicate }.
 * Se já existir um evento com a mesma idempotency_key, marca como duplicate e não
 * reprocessa (cap. 4 — idempotência obrigatória).
 */
export function registerWebhook(
  store: DataStore,
  source: string,
  eventType: string,
  externalId: string | null,
  payload: unknown,
): { event: WebhookEvent; duplicate: boolean } {
  const key = idempotencyKey(source, eventType, payload);
  const existing = store.webhook_events.find((e) => e.idempotency_key === key);
  if (existing) {
    return { event: existing, duplicate: true };
  }
  const event: WebhookEvent = {
    id: uuid(),
    source,
    event_type: eventType,
    external_id: externalId,
    idempotency_key: key,
    payload,
    status: "received",
    received_at: nowIso(),
    processed_at: null,
    error_message: null,
  };
  store.webhook_events.push(event);
  return { event, duplicate: false };
}

function upsertCustomer(store: DataStore, payload: TinyOrderPayload, channel: string): Customer {
  const c = payload.cliente ?? {};
  const document = str(c.cpf_cnpj);
  let customer = document
    ? store.customers.find((x) => x.document === document)
    : undefined;

  const isB2c = channel === "b2c_nuvemshop";
  if (!customer) {
    customer = {
      id: uuid(),
      name: str(c.nome) ?? "Cliente sem nome",
      document,
      email: str(c.email),
      phone: str(c.fone),
      whatsapp_phone: str(c.fone),
      city: str(c.cidade),
      state: str(c.uf),
      address: str(c.endereco),
      customer_type: isB2c ? "b2c" : "b2b",
      total_purchased: 0,
      last_order_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.customers.push(customer);
  } else {
    customer.name = str(c.nome) ?? customer.name;
    customer.phone = str(c.fone) ?? customer.phone;
    customer.whatsapp_phone = customer.phone;
    customer.city = str(c.cidade) ?? customer.city;
    customer.state = str(c.uf) ?? customer.state;
    customer.updated_at = nowIso();
  }
  return customer;
}

/**
 * Mapeia a situação do pedido no Tiny (rótulo ou código) para o status logístico
 * interno. Tolerante a variações de texto e ao código numérico da API V3.
 */
export function mapTinyStatus(situacao: unknown): import("@/lib/types").LogisticStatus {
  const s = String(situacao ?? "").trim().toLowerCase();
  if (!s) return "aguardando_separacao";
  if (s.includes("cancel")) return "finalizado";
  if (s.includes("entregue")) return "entregue";
  if (s.includes("enviad")) return "aguardando_coleta"; // "Enviada" = embalado → expedição
  if (s.includes("fatur")) return "aguardando_faturamento";
  // aberta, aprovada, preparando envio, pronto para envio → ainda pré-expedição
  // Códigos V3: 0 aberta,1 faturada,2 cancelada,3 aprovada,4 preparando,5 enviada,6 entregue,7 pronto
  if (s === "1") return "aguardando_faturamento";
  if (s === "2") return "finalizado";
  if (s === "5") return "aguardando_coleta";
  if (s === "6") return "entregue";
  return "aguardando_separacao";
}

/**
 * Resolve a transportadora para o id cadastrado. Tenta correspondência exata e,
 * em seguida, por conteúdo (ex.: Tiny "LENOIR Transportadora" → cadastro "Lenoir").
 */
function resolveCarrierId(store: DataStore, name: string | null): string | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  if (!target) return null;
  const exact = store.carriers.find((c) => c.name.trim().toLowerCase() === target);
  if (exact) return exact.id;
  const partial = store.carriers.find((c) => {
    const n = c.name.trim().toLowerCase();
    return n.length >= 3 && (target.includes(n) || n.includes(target));
  });
  return partial?.id ?? null;
}

/**
 * Resolve a transportadora pelo nome; se não existir no cadastro, cria
 * automaticamente (ex.: "Retirar pessoalmente", transportadoras regionais).
 * "Retira(r/da)…" entra como pickup (SLA 0, sem transporte).
 */
/** Retirada no CD (cliente busca pessoalmente) — não é coleta de transportadora. */
export function isPickupCarrier(name: string | null | undefined): boolean {
  return /retir/i.test(name ?? "");
}

export function resolveOrCreateCarrier(store: DataStore, name: string | null): string | null {
  if (!name || !name.trim()) return null;
  const existing = resolveCarrierId(store, name);
  if (existing) return existing;
  const isPickup = /retira/i.test(name);
  const carrier: Carrier = {
    id: uuid(),
    name: name.trim(),
    mode: "manual",
    tracking_url_template: null,
    default_sla_days: isPickup ? 0 : 5,
    portal_instructions: isPickup ? "Cliente retira no CD (sem transporte)." : null,
    active: true,
    created_at: nowIso(),
  };
  store.carriers.push(carrier);
  return carrier.id;
}

/** Garante uma expedição (shipment) em "aguardando_coleta" para o pedido entrar no Checkout. */
function ensureExpeditionShipment(store: DataStore, order: Order, carrierName: string | null): Shipment {
  const carrierId = resolveOrCreateCarrier(store, carrierName);
  const existing = store.shipments.find((s) => s.order_id === order.id);
  if (existing) {
    if (existing.status === "pendente") {
      existing.status = "aguardando_coleta";
      existing.updated_at = nowIso();
    }
    // Preenche a transportadora do pedido se ainda não tiver (e não foi coletado).
    if (!existing.carrier_id && carrierId && !existing.real_collected_at) {
      existing.carrier_id = carrierId;
      existing.updated_at = nowIso();
    }
    return existing;
  }
  const shipment: Shipment = {
    id: uuid(),
    order_id: order.id,
    invoice_id: null,
    carrier_id: carrierId,
    batch_id: null,
    tracking_code: null,
    tracking_url: null,
    planned_ship_date: nowIso(),
    real_collected_at: null,
    estimated_delivery_at: null,
    delivered_at: null,
    total_weight: null,
    volume_measures: null,
    status: "aguardando_coleta",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  store.shipments.push(shipment);
  return shipment;
}

// Status "travados": já passaram pela coleta real; não voltam atrás por sync de status.
const LOCKED_STATUSES = new Set(["coletado", "em_transito", "atrasado", "ocorrencia", "finalizado", "entregue"]);

/**
 * Aplica o status do Tiny ao pedido sem reverter etapas já cumpridas (bipagem).
 * Para B2B (Mercos) em "Enviada", cria a expedição → entra no Checkout.
 */
function applyStatusFlow(store: DataStore, order: Order, target: import("@/lib/types").LogisticStatus, channel: string, carrierName: string | null) {
  if (target === "entregue") {
    order.logistic_status = "entregue";
    const sh = store.shipments.find((s) => s.order_id === order.id);
    if (sh && !sh.delivered_at) {
      sh.delivered_at = nowIso();
      sh.status = "entregue";
      sh.updated_at = nowIso();
    }
    return;
  }
  if (target === "finalizado") {
    // pedido cancelado: sai do checkout se ainda não foi coletado
    order.logistic_status = "finalizado";
    const sh = store.shipments.find((s) => s.order_id === order.id);
    if (sh && !sh.real_collected_at) {
      store.shipments = store.shipments.filter((s) => s.id !== sh.id);
      store.shipment_volumes = store.shipment_volumes.filter((v) => v.shipment_id !== sh.id);
    }
    return;
  }
  if (LOCKED_STATUSES.has(order.logistic_status)) return; // não reverte coleta/trânsito

  if (target === "aguardando_coleta") {
    if (channel === "b2b_mercos") {
      order.logistic_status = "aguardando_coleta";
      ensureExpeditionShipment(store, order, carrierName);
    } else {
      order.logistic_status = "em_transito"; // B2C enviado: não passa pelo checkout
    }
    return;
  }
  order.logistic_status = target;
}

/**
 * Upsert de pedido a partir do payload do Tiny. Detecta canal por regras,
 * cria/atualiza cliente, pedido e itens. Idempotente por numero do pedido.
 */
export function ingestOrder(store: DataStore, payload: TinyOrderPayload): Order {
  const { channel } = detectChannel(payload, store.channel_detection_rules);
  const customer = upsertCustomer(store, payload, channel);

  const orderNumber = str(payload.numero) ?? str(payload.id) ?? uuid();
  let order = store.orders.find(
    (o) => o.order_number === orderNumber && o.source === "tiny",
  );

  const marcador = payload.marcadores?.[0]?.descricao;

  // Converte data do Tiny (DD/MM/YYYY ou YYYY-MM-DD) para ISO date string.
  function tinyDateToIso(v: unknown): string | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    return null;
  }

  const fields = {
    external_order_number: str(payload.numero_ecommerce),
    channel,
    customer_id: customer.id,
    tiny_status: str(payload.situacao),
    total_value: num(payload.valor),
    city: str(payload.cliente?.cidade),
    state: str(payload.cliente?.uf),
    seller: str(payload.vendedor),
    price_list: str(payload.lista_preco),
    order_origin: str(payload.ecommerce?.nome),
    carrier_name: str(payload.transportadora),
    order_date: tinyDateToIso((payload as Record<string, unknown>).data),
    due_date: tinyDateToIso((payload as Record<string, unknown>).vencimento),
    tags: marcador ? [marcador] : [],
    raw_payload: payload,
  };

  if (!order) {
    order = {
      id: uuid(),
      source: "tiny",
      source_order_id: str(payload.id),
      tiny_id: str(payload.id),
      order_number: orderNumber,
      logistic_status: "aguardando_separacao",
      created_at: nowIso(),
      updated_at: nowIso(),
      ...fields,
    } as Order;
    store.orders.push(order);

    (payload.itens ?? []).forEach((it) => {
      store.order_items.push({
        id: uuid(),
        order_id: order!.id,
        sku: str(it.codigo),
        description: str(it.descricao) ?? "Item",
        quantity: num(it.quantidade),
        unit_value: num(it.valor_unitario),
      });
    });
  } else {
    Object.assign(order, fields, { updated_at: nowIso() });
    // Se o pedido já existe mas agora temos itens (e não tínhamos antes), adicionar
    const existingItems = store.order_items.filter((i) => i.order_id === order.id);
    const newItems = (payload.itens ?? []).filter((it) => it.codigo || it.descricao);
    if (existingItems.length === 0 && newItems.length > 0) {
      newItems.forEach((it) => {
        store.order_items.push({
          id: uuid(),
          order_id: order.id,
          sku: str(it.codigo),
          description: str(it.descricao) ?? "Item",
          quantity: num(it.quantidade),
          unit_value: num(it.valor_unitario),
        });
      });
    }
  }

  // Aplica o status do Tiny (e leva B2B "Enviado" para o Checkout de Expedição).
  applyStatusFlow(store, order, mapTinyStatus(payload.situacao), channel, str(payload.transportadora));

  store.audit_logs.push({
    id: uuid(),
    entity: "order",
    entity_id: order.id,
    action: "ingest_tiny_order",
    detail: `canal=${channel} status=${order.logistic_status}`,
    user_id: null,
    created_at: nowIso(),
  });

  return order;
}

/**
 * Puxa a nota fiscal (número + chave) dos pedidos B2B em expedição que ainda não
 * têm a NF resolvida. Limitado por `cap` para não estourar o tempo da função.
 * Também preenche o rastreio se a NF já trouxer. Retorna quantos foram enriquecidos.
 */
export async function enrichExpeditionNFs(store: DataStore, cap = 50): Promise<number> {
  // Transportadoras que têm rastreio por código (Correios/Jadlog/J&T…).
  const trackingCarrierIds = new Set(
    store.carriers.filter((c) => c.tracking_url_template).map((c) => c.id),
  );
  const needsTrackingCode = (o: Order): boolean => {
    if (!["coletado", "em_transito", "atrasado"].includes(o.logistic_status)) return false;
    const sh = store.shipments.find((s) => s.order_id === o.id);
    return Boolean(sh && !sh.tracking_code && sh.carrier_id && trackingCarrierIds.has(sh.carrier_id));
  };
  const candidates = store.orders
    .filter(
      (o) =>
        o.channel === "b2b_mercos" &&
        o.tiny_id &&
        // em coleta sem NF/prazo, OU já saiu mas a expedição ainda não tem o
        // código de rastreio de uma transportadora que usa código.
        ((o.logistic_status === "aguardando_coleta" && (!o.nf_chave || !o.expected_delivery_at)) ||
          needsTrackingCode(o)),
    )
    .slice(0, cap);

  let enriched = 0;
  for (const order of candidates) {
    try {
      const nf = await fetchOrderNF(order.tiny_id!);
      if (nf && (nf.chave || nf.numero)) {
        order.nf_chave = nf.chave;
        order.nf_numero = nf.numero;
        // Frete e prazo (data prevista de entrega) do pedido/NF.
        if (nf.valorFrete != null) order.freight_value = nf.valorFrete;
        const sh = store.shipments.find((s) => s.order_id === order.id);
        if (nf.dataPrevista) {
          order.expected_delivery_at = nf.dataPrevista;
          // Se já houver expedição, alinha o prazo de entrega ao do Tiny.
          if (sh && !sh.delivered_at) sh.estimated_delivery_at = nf.dataPrevista;
        }
        // Código de rastreio da NF (Correios/Jadlog/J&T) → expedição.
        if (nf.codigoRastreamento && sh && !sh.tracking_code) {
          sh.tracking_code = nf.codigoRastreamento;
          if (nf.urlRastreamento) sh.tracking_url = nf.urlRastreamento;
        }
        order.updated_at = nowIso();
        enriched++;
      }
    } catch {
      /* ignora este pedido; tenta de novo na próxima rodada */
    }
  }
  return enriched;
}

/**
 * Re-sincroniza, buscando por ID na API V3, os pedidos B2B que ainda estão "em
 * processamento" (pré-expedição: aguardando_separacao / aguardando_faturamento).
 *
 * Motivo: o sync "recent" só varre uma janela dos pedidos mais novos; pedidos
 * antigos que avançaram no Tiny (ex.: viraram "Enviado") nunca eram re-buscados
 * e ficavam congelados no status antigo no dashboard. Aqui pegamos exatamente
 * esses casos e re-ingerimos o payload atual — o applyStatusFlow então move o
 * pedido para a etapa correta (ex.: "Enviado" → expedição/aguardando_coleta).
 *
 * Limitado por `cap` para não estourar o tempo da função. Retorna quantos
 * pedidos mudaram de status logístico.
 */
/** Busca detalhe individual dos pedidos sem due_date para capturar formasPagamento/vencimento. */
export async function enrichOrderDates(store: DataStore, cap = 40): Promise<number> {
  const candidates = store.orders
    .filter((o) => o.tiny_id && !o.due_date)
    .slice(0, cap);

  let enriched = 0;
  for (const order of candidates) {
    try {
      const payload = await fetchOrderById(order.tiny_id!);
      if (!payload) continue;
      const raw = (payload as Record<string, unknown>);
      const vencimento = raw.vencimento as string | undefined;
      const data = raw.data as string | undefined;
      let changed = false;
      if (vencimento && !order.due_date) {
        const iso = tinyDateToIso(vencimento);
        if (iso) { order.due_date = iso; changed = true; }
      }
      if (data && !order.order_date) {
        const iso = tinyDateToIso(data);
        if (iso) { order.order_date = iso; changed = true; }
      }
      if (changed) { order.updated_at = nowIso(); enriched++; }
    } catch { /* ignora */ }
  }
  return enriched;
}

function tinyDateToIso(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;
}

export async function resyncProcessingB2bOrders(store: DataStore, cap = 60): Promise<number> {
  const PROCESSING = new Set(["aguardando_separacao", "aguardando_faturamento"]);
  const candidates = store.orders
    .filter((o) => o.channel === "b2b_mercos" && o.tiny_id && PROCESSING.has(o.logistic_status))
    .slice(0, cap);

  let changed = 0;
  for (const order of candidates) {
    try {
      const payload = await fetchOrderById(order.tiny_id!);
      if (!payload) continue;
      const before = order.logistic_status;
      ingestOrder(store, payload);
      if (order.logistic_status !== before) changed++;
    } catch {
      /* ignora este pedido; tenta de novo na próxima rodada */
    }
  }
  return changed;
}

/**
 * Fallback do webhook: aplica APENAS o status quando o detalhe completo do
 * pedido não pôde ser buscado no Tiny (instabilidade/rate limit). O webhook é
 * leve mas traz id + situação — suficiente para mover o pedido de etapa em
 * tempo real (ex.: "enviado" → expedição). O próximo sync completa o resto.
 */
export function applyTinyStatusByTinyId(
  store: DataStore,
  tinyId: string,
  situacao: unknown,
  carrierName: string | null = null,
): Order | null {
  const order = store.orders.find((o) => o.tiny_id === tinyId || o.source_order_id === tinyId);
  if (!order || situacao == null || situacao === "") return null;
  const sit = String(situacao).toLowerCase().replace(/_/g, " ");
  order.tiny_status = sit;
  applyStatusFlow(store, order, mapTinyStatus(sit), order.channel, carrierName ?? order.carrier_name);
  order.updated_at = nowIso();
  return order;
}

/**
 * Reprocessa webhooks de pedido que ficaram pendentes ("received": o detalhe do
 * Tiny falhou na hora) ou com erro. Antes deste reprocesso, esses eventos ficavam
 * para sempre sem efeito e o pedido só atualizava num sync manual.
 * Retorna quantos eventos foram processados com sucesso.
 */
export async function reprocessPendingWebhooks(store: DataStore, cap = 30): Promise<number> {
  const pending = store.webhook_events
    .filter((e) => e.source === "tiny" && e.event_type === "order.webhook" && e.status !== "processed")
    .slice(-cap); // os mais recentes primeiro na prática (lista é append-only)

  let processed = 0;
  for (const event of pending) {
    try {
      const payload = event.payload as Record<string, any>;
      const entity = payload?.dados ?? payload?.pedido ?? payload;
      const tinyId = String(entity?.id ?? entity?.idPedido ?? "");
      if (!tinyId) continue;

      const full = await fetchOrderById(tinyId).catch(() => null);
      if (full) {
        const situacaoEvento = entity?.descricaoSituacao ?? entity?.codigoSituacao;
        if (situacaoEvento) {
          (full as Record<string, unknown>).situacao = String(situacaoEvento).toLowerCase().replace(/_/g, " ");
        }
        ingestOrder(store, full);
      } else {
        // Tiny ainda indisponível para o detalhe: aplica ao menos o status.
        const applied = applyTinyStatusByTinyId(
          store,
          tinyId,
          entity?.descricaoSituacao ?? entity?.codigoSituacao,
          str(entity?.transportador?.nome ?? entity?.formaEnvio?.descricao),
        );
        if (!applied) continue;
      }
      event.status = "processed";
      event.processed_at = nowIso();
      event.error_message = null;
      processed++;
    } catch {
      /* mantém pendente; tenta na próxima rodada */
    }
  }
  return processed;
}

/**
 * Ativa o fluxo logístico quando a NF é emitida: cria invoice, shipment e volumes,
 * e move o pedido para "aguardando_coleta". Idempotente por número de NF.
 */
export function ingestInvoice(
  store: DataStore,
  payload: TinyInvoicePayload,
): { invoice: Invoice; shipment: Shipment } | null {
  const orderNumber = str(payload.pedido_numero);
  const order = store.orders.find((o) => o.order_number === orderNumber);
  if (!order) return null;

  const invoiceNumber = str(payload.numero)!;
  let invoice = store.invoices.find(
    (i) => i.order_id === order.id && i.number === invoiceNumber,
  );
  if (!invoice) {
    invoice = {
      id: uuid(),
      order_id: order.id,
      number: invoiceNumber,
      series: str(payload.serie),
      access_key: str(payload.chave_acesso),
      issued_at: str(payload.data_emissao) ?? nowIso(),
      total_value: num(payload.valor) || order.total_value,
      xml_url: null,
      danfe_url: null,
      raw_payload: payload,
      created_at: nowIso(),
    };
    store.invoices.push(invoice);
  }

  // resolve transportadora pelo nome, se informado
  const carrierName = str(payload.transportadora);
  const carrier = carrierName
    ? store.carriers.find((c) => c.name.toLowerCase() === carrierName.toLowerCase())
    : undefined;

  let shipment = store.shipments.find((s) => s.order_id === order.id);
  const volumeCount = Math.max(1, Math.round(num(payload.volumes)) || 1);

  if (!shipment) {
    shipment = {
      id: uuid(),
      order_id: order.id,
      invoice_id: invoice.id,
      carrier_id: carrier?.id ?? null,
      batch_id: null,
      tracking_code: null,
      tracking_url: null,
      planned_ship_date: nowIso(),
      real_collected_at: null,
      estimated_delivery_at: null,
      delivered_at: null,
      total_weight: num(payload.peso) || null,
      volume_measures: null,
      status: "aguardando_coleta",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    store.shipments.push(shipment);

    for (let v = 1; v <= volumeCount; v++) {
      store.shipment_volumes.push({
        id: uuid(),
        shipment_id: shipment.id,
        volume_number: v,
        barcode: `${invoiceNumber}-VOL-${v}`,
        weight: null,
        height: null,
        width: null,
        length: null,
        expected: true,
        scanned: false,
        scanned_at: null,
        photo_url: null,
      });
    }
  } else {
    shipment.invoice_id = invoice.id;
    if (carrier) shipment.carrier_id = carrier.id;
    shipment.updated_at = nowIso();
  }

  order.logistic_status = "aguardando_coleta";
  order.updated_at = nowIso();

  return { invoice, shipment };
}

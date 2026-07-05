import type {
  AutomationRule,
  Carrier,
  ChannelDetectionRule,
  DataStore,
  MessageTemplate,
  User,
} from "@/lib/types";
import { addDays } from "@/lib/utils/sla-rules";

const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const hoursAgo = (n: number) => iso(new Date(Date.now() - n * 3600000));

const users: User[] = [
  { id: "user-admin", name: "Renato (Admin)", email: "admin@nyer.com.br", role: "admin" },
  { id: "user-exp", name: "Expedição", email: "expedicao@nyer.com.br", role: "operador" },
];

const carriers: Carrier[] = [
  { id: "car-braspress", name: "Braspress", mode: "manual", tracking_url_template: "https://www.braspress.com/", default_sla_days: 5, portal_instructions: "Consultar por CNPJ + NF no site.", active: true, created_at: daysAgo(60) },
  { id: "car-rodonaves", name: "Rodonaves", mode: "manual", tracking_url_template: "https://www.rodonaves.com.br/rastreio-de-mercadoria", default_sla_days: 4, portal_instructions: "Rastreio por NF/CNPJ.", active: true, created_at: daysAgo(60) },
  { id: "car-jadlog", name: "Jadlog", mode: "portal", tracking_url_template: "https://www.jadlog.com.br/tracking?cte={{tracking_code}}", default_sla_days: 6, portal_instructions: "Tracking por código CTE.", active: true, created_at: daysAgo(60) },
  { id: "car-correios", name: "Correios", mode: "portal", tracking_url_template: "https://rastreamento.correios.com.br/app/index.php?objeto={{tracking_code}}", default_sla_days: 8, portal_instructions: "Rastreio por código do objeto.", active: true, created_at: daysAgo(60) },
  { id: "car-jt", name: "J&T", mode: "manual", tracking_url_template: "https://www.jtexpress.com.br/trajectoryQuery?billcode={{tracking_code}}", default_sla_days: 7, portal_instructions: null, active: true, created_at: daysAgo(60) },
  { id: "car-saomiguel", name: "Expresso São Miguel", mode: "manual", tracking_url_template: null, default_sla_days: 4, portal_instructions: "Validar API com gerente de conta.", active: true, created_at: daysAgo(60) },
  { id: "car-arlete", name: "Arlete", mode: "manual", tracking_url_template: null, default_sla_days: 5, portal_instructions: "Manual assistido até validação de EDI/API.", active: true, created_at: daysAgo(60) },
  { id: "car-lenoir", name: "Lenoir", mode: "manual", tracking_url_template: null, default_sla_days: 5, portal_instructions: "Confirmar transportadora correta.", active: true, created_at: daysAgo(60) },
];

const channelRules: ChannelDetectionRule[] = [
  { id: "rule-mercos-origin", name: "Origem contém Mercos → B2B", source: "tiny", json_path: "ecommerce.nome", operator: "contains", expected_value: "Mercos", result_channel: "b2b_mercos", priority: 10, active: true },
  { id: "rule-mercos-tag", name: "Marcador Mercos → B2B", source: "tiny", json_path: "marcadores.0.descricao", operator: "contains", expected_value: "Mercos", result_channel: "b2b_mercos", priority: 20, active: true },
  { id: "rule-nuvem-tag", name: "Marcador Nuvemshop → B2C", source: "tiny", json_path: "marcadores.0.descricao", operator: "contains", expected_value: "Nuvemshop", result_channel: "b2c_nuvemshop", priority: 30, active: true },
  { id: "rule-nuvem-origin", name: "Origem contém Nuvemshop → B2C", source: "tiny", json_path: "ecommerce.nome", operator: "contains", expected_value: "Nuvem", result_channel: "b2c_nuvemshop", priority: 40, active: true },
];

const templates: MessageTemplate[] = [
  { id: "tpl-coleta", key: "pedido_coletado", name: "Coleta confirmada", trigger: "EXPEDICAO_COLETADA", audience: "cliente", active: true, body: "Olá {{cliente_nome}}! Seu pedido NYER foi coletado pela transportadora {{transportadora}}. Acompanhe pela NF/CNPJ ou pelo link: {{link_rastreio}}." },
  { id: "tpl-rastreio", key: "rastreio_disponivel", name: "Rastreio disponível", trigger: "RASTREIO_DISPONIVEL", audience: "cliente", active: true, body: "Seu pedido já tem rastreio. Código: {{codigo_rastreio}}. Consulte em {{link_rastreio}}." },
  { id: "tpl-previsao", key: "previsao_amanha", name: "Previsão para amanhã", trigger: "PREVISAO_1D", audience: "cliente", active: false, body: "Seu pedido está com previsão de entrega para amanhã. Qualquer divergência, nosso time já está acompanhando por aqui." },
  { id: "tpl-entregue", key: "pedido_entregue", name: "Entrega confirmada", trigger: "PEDIDO_ENTREGUE", audience: "cliente", active: true, body: "Seu pedido foi entregue. Conferiu se chegou tudo certinho?" },
  { id: "tpl-pos7", key: "pos_entrega_7d", name: "Pós-entrega 7 dias", trigger: "POS_ENTREGA_7D", audience: "cliente", active: false, body: "Quer que eu te envie materiais de divulgação dos produtos para ajudar a vender mais rápido?" },
  { id: "tpl-pos15", key: "pos_entrega_15d", name: "Pós-entrega 15-25 dias", trigger: "POS_ENTREGA_15D", audience: "cliente", active: false, body: "Como está o giro dos produtos? Posso te ajudar a montar uma reposição ou campanha?" },
];

const automationRules: AutomationRule[] = [
  { id: "auto-order", key: "pedido_criado", name: "Pedido criado", trigger: "WEBHOOK_TINY_ORDER", action: "upsert_order_customer", active: true, config: {} },
  { id: "auto-nf", key: "nf_emitida", name: "NF emitida", trigger: "WEBHOOK_TINY_INVOICE", action: "activate_logistics", active: true, config: {} },
  { id: "auto-coleta", key: "coleta_confirmada", name: "Coleta confirmada", trigger: "EXPEDICAO_COLETADA", action: "start_sla_and_notify", active: true, config: { send_whatsapp: true } },
  { id: "auto-semrastreio", key: "sem_rastreio", name: "Sem rastreio após X horas", trigger: "CRON_TRACKING_CHECK", action: "create_alert", active: true, config: { hours: 24 } },
  { id: "auto-risco", key: "entrega_em_risco", name: "Entrega em risco", trigger: "CRON_SLA_CHECK", action: "create_alert", active: true, config: { risk_window_hours: 24 } },
  { id: "auto-atraso", key: "atrasado", name: "Atrasado", trigger: "CRON_SLA_CHECK", action: "create_occurrence", active: true, config: { notify_customer: false } },
  { id: "auto-entregue", key: "entregue", name: "Entregue", trigger: "PEDIDO_ENTREGUE", action: "notify_and_task", active: true, config: {} },
];

interface OrderSpec {
  num: string;
  ext: string;
  customer: {
    name: string; document: string; city: string; state: string;
    phone: string; address: string;
  };
  total: number;
  carrierId: string;
  state: "aguardando_coleta" | "coletado_hoje" | "em_transito" | "em_risco" | "atrasado" | "sem_nf";
  items: { sku: string; desc: string; qty: number; val: number }[];
  volumes: number;
}

const orderSpecs: OrderSpec[] = [
  {
    num: "10001", ext: "MERCOS-55021",
    customer: { name: "Suplementos Forte Ltda", document: "12.345.678/0001-90", city: "Curitiba", state: "PR", phone: "5541999990001", address: "Rua das Academias, 100" },
    total: 4820.5, carrierId: "car-braspress", state: "aguardando_coleta",
    items: [{ sku: "WHEY-900", desc: "Whey Protein 900g", qty: 24, val: 120 }, { sku: "CREA-300", desc: "Creatina 300g", qty: 20, val: 95 }],
    volumes: 3,
  },
  {
    num: "10002", ext: "MERCOS-55022",
    customer: { name: "Mundo Fitness Distribuidora", document: "98.765.432/0001-10", city: "Joinville", state: "SC", phone: "5547999990002", address: "Av. Central, 2000" },
    total: 7310.0, carrierId: "car-rodonaves", state: "coletado_hoje",
    items: [{ sku: "WHEY-900", desc: "Whey Protein 900g", qty: 40, val: 120 }, { sku: "BCAA-200", desc: "BCAA 200g", qty: 30, val: 85 }],
    volumes: 4,
  },
  {
    num: "10003", ext: "MERCOS-55023",
    customer: { name: "Loja Power Nutrição", document: "11.222.333/0001-44", city: "São Paulo", state: "SP", phone: "5511999990003", address: "Rua Augusta, 500" },
    total: 5990.9, carrierId: "car-jadlog", state: "em_transito",
    items: [{ sku: "WHEY-2KG", desc: "Whey Protein 2kg", qty: 30, val: 180 }],
    volumes: 2,
  },
  {
    num: "10004", ext: "MERCOS-55024",
    customer: { name: "Atacado Saúde & Cia", document: "44.555.666/0001-77", city: "Porto Alegre", state: "RS", phone: "5551999990004", address: "Av. Ipiranga, 800" },
    total: 3120.0, carrierId: "car-saomiguel", state: "em_risco",
    items: [{ sku: "CREA-300", desc: "Creatina 300g", qty: 32, val: 95 }],
    volumes: 2,
  },
  {
    num: "10005", ext: "MERCOS-55025",
    customer: { name: "Distribuidora Vida Ativa", document: "77.888.999/0001-22", city: "Belo Horizonte", state: "MG", phone: "5531999990005", address: "Av. Afonso Pena, 1200" },
    total: 8990.0, carrierId: "car-braspress", state: "atrasado",
    items: [{ sku: "WHEY-900", desc: "Whey Protein 900g", qty: 50, val: 120 }, { sku: "PRE-300", desc: "Pré-treino 300g", qty: 40, val: 75 }],
    volumes: 5,
  },
  {
    num: "10006", ext: "NUVEM-88001",
    customer: { name: "João Cliente Final", document: "123.456.789-00", city: "Florianópolis", state: "SC", phone: "5548999990006", address: "Rua das Praias, 45" },
    total: 389.9, carrierId: "car-correios", state: "sem_nf",
    items: [{ sku: "WHEY-900", desc: "Whey Protein 900g", qty: 2, val: 150 }],
    volumes: 1,
  },
];

function rawTinyPayload(spec: OrderSpec, channel: "mercos" | "nuvem") {
  return {
    id: `tiny-${spec.num}`,
    numero: spec.num,
    numero_ecommerce: spec.ext,
    situacao: spec.state === "sem_nf" ? "aprovado" : "faturado",
    valor: spec.total,
    ecommerce: { nome: channel === "mercos" ? "Mercos" : "Nuvemshop NYER" },
    marcadores: [{ descricao: channel === "mercos" ? "Atacado/Mercos" : "Varejo/Nuvemshop" }],
    cliente: {
      nome: spec.customer.name,
      cpf_cnpj: spec.customer.document,
      fone: spec.customer.phone,
      endereco: spec.customer.address,
      cidade: spec.customer.city,
      uf: spec.customer.state,
    },
    vendedor: channel === "mercos" ? "Equipe B2B" : "Loja Online",
    lista_preco: channel === "mercos" ? "Atacado" : "Varejo",
    itens: spec.items.map((i) => ({ codigo: i.sku, descricao: i.desc, quantidade: i.qty, valor_unitario: i.val })),
  };
}

export function buildSeedStore(): DataStore {
  const store: DataStore = {
    users,
    customers: [],
    orders: [],
    order_items: [],
    invoices: [],
    carriers,
    shipments: [],
    shipment_volumes: [],
    checkout_scans: [],
    shipping_batches: [],
    carrier_tracking_events: [],
    sla_records: [],
    occurrences: [],
    message_templates: templates,
    message_logs: [],
    automation_rules: automationRules,
    alerts: [],
    freight_quotes: [],
    webhook_events: [],
    api_sync_logs: [],
    channel_detection_rules: channelRules,
    customer_tasks: [],
    audit_logs: [],
  };

  orderSpecs.forEach((spec, idx) => {
    const isB2C = spec.ext.startsWith("NUVEM");
    const channelKind = isB2C ? "nuvem" : "mercos";
    const customerId = `cust-${spec.num}`;
    const orderId = `ord-${spec.num}`;
    const carrier = carriers.find((c) => c.id === spec.carrierId)!;

    store.customers.push({
      id: customerId,
      name: spec.customer.name,
      document: spec.customer.document,
      email: null,
      phone: spec.customer.phone,
      whatsapp_phone: spec.customer.phone,
      city: spec.customer.city,
      state: spec.customer.state,
      address: spec.customer.address,
      customer_type: isB2C ? "b2c" : "b2b",
      total_purchased: spec.total,
      last_order_at: daysAgo(idx + 1),
      created_at: daysAgo(40),
      updated_at: daysAgo(idx + 1),
    });

    const logisticStatus =
      spec.state === "sem_nf" ? "aguardando_faturamento"
      : spec.state === "aguardando_coleta" ? "aguardando_coleta"
      : spec.state === "coletado_hoje" ? "coletado"
      : spec.state === "em_transito" ? "em_transito"
      : spec.state === "em_risco" ? "em_transito"
      : "atrasado";

    store.orders.push({
      id: orderId,
      source: "tiny",
      source_order_id: `tiny-${spec.num}`,
      tiny_id: `tiny-${spec.num}`,
      order_number: spec.num,
      external_order_number: spec.ext,
      channel: isB2C ? "b2c_nuvemshop" : "b2b_mercos",
      customer_id: customerId,
      tiny_status: spec.state === "sem_nf" ? "aprovado" : "faturado",
      logistic_status: logisticStatus,
      total_value: spec.total,
      city: spec.customer.city,
      state: spec.customer.state,
      seller: channelKind === "mercos" ? "Equipe B2B" : "Loja Online",
      price_list: channelKind === "mercos" ? "Atacado" : "Varejo",
      order_origin: channelKind === "mercos" ? "Mercos" : "Nuvemshop NYER",
      carrier_name: null,
      nf_numero: null,
      nf_chave: null,
      freight_value: null,
      expected_delivery_at: null,
      order_date: null,
      due_date: null,
      tags: channelKind === "mercos" ? ["Atacado/Mercos"] : ["Varejo/Nuvemshop"],
      raw_payload: rawTinyPayload(spec, channelKind),
      created_at: daysAgo(idx + 2),
      updated_at: daysAgo(idx + 1),
    });

    spec.items.forEach((it, i) => {
      store.order_items.push({
        id: `item-${spec.num}-${i}`,
        order_id: orderId,
        sku: it.sku,
        description: it.desc,
        quantity: it.qty,
        unit_value: it.val,
      });
    });

    if (spec.state === "sem_nf") return; // B2C ainda sem NF/expedição

    const invoiceId = `inv-${spec.num}`;
    store.invoices.push({
      id: invoiceId,
      order_id: orderId,
      number: `NF${spec.num}`,
      series: "1",
      access_key: `3524${spec.num}000000000000000000000000000000000${idx}`,
      issued_at: daysAgo(idx + 1),
      total_value: spec.total,
      xml_url: null,
      danfe_url: null,
      raw_payload: { numero: `NF${spec.num}`, serie: "1" },
      created_at: daysAgo(idx + 1),
    });

    // Datas conforme estado
    let collectedAt: string | null = null;
    let deliveredAt: string | null = null;
    let shipStatus: "aguardando_coleta" | "coletado" | "em_transito" | "entregue" = "aguardando_coleta";
    let estimatedDelivery: string | null = null;

    if (spec.state === "coletado_hoje") {
      collectedAt = hoursAgo(3);
      shipStatus = "coletado";
      estimatedDelivery = addDays(collectedAt, carrier.default_sla_days);
    } else if (spec.state === "em_transito") {
      collectedAt = daysAgo(2);
      shipStatus = "em_transito";
      estimatedDelivery = addDays(collectedAt, carrier.default_sla_days);
    } else if (spec.state === "em_risco") {
      collectedAt = daysAgo(carrier.default_sla_days - 1);
      shipStatus = "em_transito";
      estimatedDelivery = addDays(collectedAt, carrier.default_sla_days); // ~amanhã
    } else if (spec.state === "atrasado") {
      collectedAt = daysAgo(carrier.default_sla_days + 3);
      shipStatus = "em_transito";
      estimatedDelivery = addDays(collectedAt, carrier.default_sla_days); // já venceu
    }

    const shipmentId = `ship-${spec.num}`;
    store.shipments.push({
      id: shipmentId,
      order_id: orderId,
      invoice_id: invoiceId,
      carrier_id: spec.carrierId,
      batch_id: null,
      tracking_code: shipStatus === "aguardando_coleta" ? null : `BR${spec.num}TRACK`,
      tracking_url: carrier.tracking_url_template
        ? carrier.tracking_url_template.replace("{{tracking_code}}", `BR${spec.num}TRACK`)
        : null,
      planned_ship_date: daysAgo(idx),
      real_collected_at: collectedAt,
      estimated_delivery_at: estimatedDelivery,
      delivered_at: deliveredAt,
      total_weight: spec.volumes * 8.5,
      volume_measures: `${spec.volumes}x 40x30x30cm`,
      status: shipStatus,
      created_at: daysAgo(idx + 1),
      updated_at: daysAgo(idx),
    });

    for (let v = 1; v <= spec.volumes; v++) {
      const collected = collectedAt != null;
      store.shipment_volumes.push({
        id: `vol-${spec.num}-${v}`,
        shipment_id: shipmentId,
        volume_number: v,
        barcode: `${spec.num}-VOL-${v}`,
        weight: 8.5,
        height: 30, width: 30, length: 40,
        expected: true,
        scanned: collected,
        scanned_at: collected ? collectedAt : null,
        photo_url: null,
      });
    }

    // SLA coleta→entrega quando há coleta
    if (collectedAt) {
      store.sla_records.push({
        id: `sla-${spec.num}`,
        order_id: orderId,
        shipment_id: shipmentId,
        sla_type: "coleta_entrega",
        starts_at: collectedAt,
        deadline_at: estimatedDelivery,
        completed_at: deliveredAt,
        status:
          spec.state === "atrasado" ? "atrasado"
          : spec.state === "em_risco" ? "em_risco"
          : "no_prazo",
        delay_hours: null,
      });
    }

    // Evento de rastreio para em_transito/em_risco
    if (spec.state === "em_transito" || spec.state === "em_risco") {
      store.carrier_tracking_events.push({
        id: `trk-${spec.num}-1`,
        shipment_id: shipmentId,
        status: "em_transito",
        description: "Objeto em trânsito - origem para destino",
        occurred_at: daysAgo(1),
        raw_payload: {},
        created_at: daysAgo(1),
      });
    }

    // Atrasado: alerta + ocorrência
    if (spec.state === "atrasado") {
      store.alerts.push({
        id: `alert-${spec.num}`,
        order_id: orderId,
        shipment_id: shipmentId,
        type: "atrasado",
        message: `Pedido ${spec.num} ultrapassou a data limite de entrega.`,
        resolved: false,
        created_at: hoursAgo(5),
      });
      store.occurrences.push({
        id: `occ-${spec.num}`,
        order_id: orderId,
        shipment_id: shipmentId,
        carrier_id: spec.carrierId,
        type: "atraso",
        severity: "alta",
        status: "aberta",
        description: "Atraso detectado automaticamente pelo SLA.",
        responsible_user_id: null,
        opened_at: hoursAgo(5),
        resolved_at: null,
      });
    }

    // Mensagem de coleta registrada para coletados
    if (collectedAt) {
      store.message_logs.push({
        id: `msg-${spec.num}`,
        order_id: orderId,
        customer_id: customerId,
        template_id: "tpl-coleta",
        trigger_key: "EXPEDICAO_COLETADA",
        phone: spec.customer.phone,
        direction: "outbound",
        content: `Olá ${spec.customer.name}! Seu pedido NYER foi coletado pela transportadora ${carrier.name}.`,
        provider_message_id: `mock-${spec.num}`,
        status: "sent",
        sent_at: collectedAt,
        delivered_at: null,
        read_at: null,
        error_message: null,
        created_at: collectedAt,
      });
    }
  });

  return store;
}

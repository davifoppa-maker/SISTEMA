// Tipos de domínio do sistema de pós-venda logístico NYER.

export type Channel =
  | "b2b_mercos"
  | "b2c_nuvemshop"
  | "mercado_livre"
  | "manual"
  | "indefinido";

export type LogisticStatus =
  | "aguardando_separacao"
  | "aguardando_faturamento"
  | "aguardando_coleta"
  | "coletado"
  | "em_transito"
  | "entregue"
  | "atrasado"
  | "ocorrencia"
  | "finalizado";

export type ShipmentStatus =
  | "pendente"
  | "aguardando_coleta"
  | "coletado"
  | "em_transito"
  | "entregue"
  | "ocorrencia";

export type CarrierMode = "manual" | "portal" | "api" | "edi" | "hub";

export type SlaType =
  | "aprovacao_faturamento"
  | "faturamento_separacao"
  | "separacao_coleta"
  | "coleta_entrega"
  | "ciclo_total";

export type SlaStatus = "no_prazo" | "em_risco" | "atrasado" | "concluido";

export type OccurrenceType =
  | "atraso"
  | "avaria"
  | "extravio"
  | "cliente_ausente"
  | "endereco_incorreto"
  | "aguardando_retirada"
  | "reentrega"
  | "devolucao";

export type OccurrenceStatus = "aberta" | "em_andamento" | "resolvida";

export type MessageDirection = "outbound" | "inbound";
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "opted_out";

export type AlertType =
  | "sem_rastreio"
  | "em_risco"
  | "atrasado"
  | "pendencia"
  | "entrega_confirmada";

export type WebhookStatus = "received" | "processed" | "error" | "duplicate";

export type RuleOperator =
  | "equals"
  | "contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "exists";

export interface Customer {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  customer_type: "b2b" | "b2c";
  total_purchased: number;
  last_order_at: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  sku: string | null;
  description: string;
  quantity: number;
  unit_value: number;
}

export interface Order {
  id: string;
  source: string; // "tiny", "manual"...
  source_order_id: string | null;
  tiny_id: string | null;
  order_number: string;
  external_order_number: string | null;
  channel: Channel;
  customer_id: string;
  tiny_status: string | null;
  logistic_status: LogisticStatus;
  total_value: number;
  city: string | null;
  state: string | null;
  seller: string | null;
  price_list: string | null;
  order_origin: string | null;
  carrier_name: string | null;
  nf_numero: string | null;
  nf_chave: string | null;
  /** Valor do frete (R$) capturado do pedido/NF no Tiny. */
  freight_value: number | null;
  /** Prazo / data prevista de entrega (vira a SLA do pedido). */
  expected_delivery_at: string | null;
  /** Data real do pedido no Tiny (campo `data` do payload V3). */
  order_date: string | null;
  /** Data de vencimento do boleto (formasPagamento[0].vencimento). */
  due_date: string | null;
  /** Natureza de operação (campo `nat_operacao` do Tiny). */
  nat_operacao?: string | null;
  tags: string[];
  raw_payload: unknown;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  number: string;
  series: string | null;
  access_key: string | null;
  issued_at: string | null;
  total_value: number;
  xml_url: string | null;
  danfe_url: string | null;
  raw_payload: unknown;
  created_at: string;
}

export interface Carrier {
  id: string;
  name: string;
  mode: CarrierMode;
  tracking_url_template: string | null;
  default_sla_days: number;
  portal_instructions: string | null;
  active: boolean;
  created_at: string;
}

export interface ShipmentVolume {
  id: string;
  shipment_id: string;
  volume_number: number;
  barcode: string | null;
  weight: number | null;
  height: number | null;
  width: number | null;
  length: number | null;
  expected: boolean;
  scanned: boolean;
  scanned_at: string | null;
  photo_url: string | null;
}

export interface Shipment {
  id: string;
  order_id: string;
  invoice_id: string | null;
  carrier_id: string | null;
  batch_id: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  planned_ship_date: string | null;
  real_collected_at: string | null;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  total_weight: number | null;
  volume_measures: string | null;
  status: ShipmentStatus;
  created_at: string;
  updated_at: string;
}

export interface CheckoutScan {
  id: string;
  shipment_id: string;
  volume_id: string | null;
  scanned_code: string;
  scan_type: "nf" | "volume" | "etiqueta";
  user_id: string | null;
  scanned_at: string;
  notes: string | null;
}

export interface ShippingBatch {
  id: string;
  carrier_id: string | null;
  collector_name: string | null;
  collector_document: string | null;
  vehicle_plate: string | null;
  collected_at: string | null;
  closed_by_user_id: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface SlaRecord {
  id: string;
  order_id: string;
  shipment_id: string | null;
  sla_type: SlaType;
  starts_at: string | null;
  deadline_at: string | null;
  completed_at: string | null;
  status: SlaStatus;
  delay_hours: number | null;
}

export interface CarrierTrackingEvent {
  id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  occurred_at: string;
  raw_payload: unknown;
  created_at: string;
}

export interface Occurrence {
  id: string;
  order_id: string | null;
  shipment_id: string | null;
  carrier_id: string | null;
  type: OccurrenceType;
  severity: "baixa" | "media" | "alta";
  status: OccurrenceStatus;
  description: string | null;
  responsible_user_id: string | null;
  opened_at: string;
  resolved_at: string | null;
}

export interface MessageTemplate {
  id: string;
  key: string;
  name: string;
  body: string;
  trigger: string | null;
  audience: "cliente" | "interno";
  active: boolean;
}

export interface MessageLog {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  template_id: string | null;
  trigger_key: string | null;
  phone: string | null;
  direction: MessageDirection;
  content: string;
  provider_message_id: string | null;
  status: MessageStatus;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  key: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  config: Record<string, unknown>;
}

export interface Alert {
  id: string;
  order_id: string | null;
  shipment_id: string | null;
  type: AlertType;
  message: string;
  resolved: boolean;
  created_at: string;
}

export interface FreightQuote {
  id: string;
  order_id: string | null;
  carrier_id: string | null;
  quote_type: "manual" | "api";
  request_text: string | null;
  quoted_value: number | null;
  quoted_deadline_days: number | null;
  status: "aberta" | "respondida" | "escolhida" | "descartada";
  chosen: boolean;
  raw_response: unknown;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  source: string; // tiny | meta | carrier
  event_type: string;
  external_id: string | null;
  idempotency_key: string;
  payload: unknown;
  status: WebhookStatus;
  received_at: string;
  processed_at: string | null;
  error_message: string | null;
}

export interface ApiSyncLog {
  id: string;
  source: string;
  operation: string;
  ok: boolean;
  detail: string | null;
  created_at: string;
}

export interface ChannelDetectionRule {
  id: string;
  name: string;
  source: string; // tiny | manual
  json_path: string;
  operator: RuleOperator;
  expected_value: string | null;
  result_channel: Channel;
  priority: number;
  active: boolean;
}

export interface CustomerTask {
  id: string;
  customer_id: string;
  order_id: string | null;
  type: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pendente" | "concluida";
  assigned_user_id: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  detail: string | null;
  user_id: string | null;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "operador" | "comercial";
}

// Estado completo do store em memória.
export interface DataStore {
  users: User[];
  customers: Customer[];
  orders: Order[];
  order_items: OrderItem[];
  invoices: Invoice[];
  carriers: Carrier[];
  shipments: Shipment[];
  shipment_volumes: ShipmentVolume[];
  checkout_scans: CheckoutScan[];
  shipping_batches: ShippingBatch[];
  carrier_tracking_events: CarrierTrackingEvent[];
  sla_records: SlaRecord[];
  occurrences: Occurrence[];
  message_templates: MessageTemplate[];
  message_logs: MessageLog[];
  automation_rules: AutomationRule[];
  alerts: Alert[];
  freight_quotes: FreightQuote[];
  webhook_events: WebhookEvent[];
  api_sync_logs: ApiSyncLog[];
  channel_detection_rules: ChannelDetectionRule[];
  customer_tasks: CustomerTask[];
  audit_logs: AuditLog[];
}

export const LOGISTIC_STATUS_LABELS: Record<LogisticStatus, string> = {
  aguardando_separacao: "Aguardando separação",
  aguardando_faturamento: "Aguardando faturamento",
  aguardando_coleta: "Aguardando coleta",
  coletado: "Coletado",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  atrasado: "Atrasado",
  ocorrencia: "Ocorrência",
  finalizado: "Finalizado",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  b2b_mercos: "B2B Mercos",
  b2c_nuvemshop: "B2C Nuvemshop",
  mercado_livre: "Mercado Livre",
  manual: "Manual",
  indefinido: "Indefinido",
};

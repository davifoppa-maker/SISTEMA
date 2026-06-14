-- Pós Venda Exx — esquema inicial (Supabase Postgres)
-- Camada de controle logístico e pós-venda sobre o Olist Tiny.
-- UUID PK, created_at/updated_at, enums/checks para status e índices de busca.

create extension if not exists "pgcrypto";

-- ───────────────────────── ENUMs ─────────────────────────
do $$ begin
  create type channel as enum ('b2b_mercos','b2c_nuvemshop','mercado_livre','manual','indefinido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type logistic_status as enum (
    'aguardando_separacao','aguardando_faturamento','aguardando_coleta','coletado',
    'em_transito','entregue','atrasado','ocorrencia','finalizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shipment_status as enum ('pendente','aguardando_coleta','coletado','em_transito','entregue','ocorrencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type carrier_mode as enum ('manual','portal','api','edi','hub');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sla_type as enum ('aprovacao_faturamento','faturamento_separacao','separacao_coleta','coleta_entrega','ciclo_total');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sla_status as enum ('no_prazo','em_risco','atrasado','concluido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type occurrence_type as enum ('atraso','avaria','extravio','cliente_ausente','endereco_incorreto','aguardando_retirada','reentrega','devolucao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type occurrence_status as enum ('aberta','em_andamento','resolvida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('outbound','inbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_status as enum ('queued','sent','delivered','read','failed','opted_out');
exception when duplicate_object then null; end $$;

-- ───────────────────────── Tabelas ─────────────────────────
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null default 'operador',
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  email text,
  phone text,
  whatsapp_phone text,
  city text,
  state text,
  address text,
  customer_type text not null default 'b2b',
  total_purchased numeric not null default 0,
  last_order_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_customers_document on customers(document);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'tiny',
  source_order_id text,
  tiny_id text,
  order_number text not null,
  external_order_number text,
  channel channel not null default 'indefinido',
  customer_id uuid references customers(id),
  tiny_status text,
  logistic_status logistic_status not null default 'aguardando_separacao',
  total_value numeric not null default 0,
  city text,
  state text,
  seller text,
  price_list text,
  order_origin text,
  tags text[] not null default '{}',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_number on orders(order_number);
create index if not exists idx_orders_channel on orders(channel);
create index if not exists idx_orders_logistic on orders(logistic_status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  sku text,
  description text not null,
  quantity numeric not null default 0,
  unit_value numeric not null default 0
);
create index if not exists idx_order_items_order on order_items(order_id);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  number text not null,
  series text,
  access_key text,
  issued_at timestamptz,
  total_value numeric not null default 0,
  xml_url text,
  danfe_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoices_order on invoices(order_id);

create table if not exists carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode carrier_mode not null default 'manual',
  tracking_url_template text,
  default_sla_days int not null default 5,
  portal_instructions text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists shipping_batches (
  id uuid primary key default gen_random_uuid(),
  carrier_id uuid references carriers(id),
  collector_name text,
  collector_document text,
  vehicle_plate text,
  collected_at timestamptz,
  closed_by_user_id uuid references users(id),
  photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  invoice_id uuid references invoices(id),
  carrier_id uuid references carriers(id),
  batch_id uuid references shipping_batches(id),
  tracking_code text,
  tracking_url text,
  planned_ship_date timestamptz,
  real_collected_at timestamptz,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  total_weight numeric,
  volume_measures text,
  status shipment_status not null default 'pendente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_shipments_order on shipments(order_id);
create index if not exists idx_shipments_status on shipments(status);

create table if not exists shipment_volumes (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  volume_number int not null,
  barcode text,
  weight numeric,
  height numeric,
  width numeric,
  length numeric,
  expected boolean not null default true,
  scanned boolean not null default false,
  scanned_at timestamptz,
  photo_url text
);
create index if not exists idx_volumes_shipment on shipment_volumes(shipment_id);

create table if not exists checkout_scans (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  volume_id uuid references shipment_volumes(id),
  scanned_code text not null,
  scan_type text not null default 'volume',
  user_id uuid references users(id),
  scanned_at timestamptz not null default now(),
  notes text
);

create table if not exists carrier_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id) on delete cascade,
  status text not null,
  description text,
  occurred_at timestamptz not null,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_tracking_shipment on carrier_tracking_events(shipment_id);

create table if not exists sla_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  shipment_id uuid references shipments(id) on delete cascade,
  sla_type sla_type not null,
  starts_at timestamptz,
  deadline_at timestamptz,
  completed_at timestamptz,
  status sla_status not null default 'no_prazo',
  delay_hours numeric
);
create index if not exists idx_sla_shipment on sla_records(shipment_id);

create table if not exists occurrences (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  shipment_id uuid references shipments(id),
  carrier_id uuid references carriers(id),
  type occurrence_type not null,
  severity text not null default 'media',
  status occurrence_status not null default 'aberta',
  description text,
  responsible_user_id uuid references users(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists idx_occurrences_status on occurrences(status);

create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  body text not null,
  trigger text,
  audience text not null default 'cliente',
  active boolean not null default true
);

create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  customer_id uuid references customers(id),
  template_id uuid references message_templates(id),
  trigger_key text,
  phone text,
  direction message_direction not null default 'outbound',
  content text not null,
  provider_message_id text,
  status message_status not null default 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
create index if not exists idx_messages_order on message_logs(order_id);
create index if not exists idx_messages_customer on message_logs(customer_id);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  order_id uuid references orders(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  trigger text not null,
  action text not null,
  active boolean not null default true,
  config jsonb not null default '{}'
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  shipment_id uuid references shipments(id),
  type text not null,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_alerts_resolved on alerts(resolved);

create table if not exists freight_quotes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  carrier_id uuid references carriers(id),
  quote_type text not null default 'manual',
  request_text text,
  quoted_value numeric,
  quoted_deadline_days int,
  status text not null default 'aberta',
  chosen boolean not null default false,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  event_type text not null,
  external_id text,
  idempotency_key text unique not null,
  payload jsonb,
  status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text
);
create index if not exists idx_webhook_source on webhook_events(source);

create table if not exists api_sync_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  operation text not null,
  ok boolean not null default true,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists channel_detection_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null default 'tiny',
  json_path text not null,
  operator text not null,
  expected_value text,
  result_channel channel not null,
  priority int not null default 100,
  active boolean not null default true
);

create table if not exists customer_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id),
  type text not null,
  title text not null,
  description text,
  due_at timestamptz,
  status text not null default 'pendente',
  assigned_user_id uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  entity_id text not null,
  action text not null,
  detail text,
  user_id uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_logs(entity, entity_id);

-- Trigger genérico de updated_at
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

do $$ begin
  create trigger trg_orders_updated before update on orders for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_shipments_updated before update on shipments for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_customers_updated before update on customers for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

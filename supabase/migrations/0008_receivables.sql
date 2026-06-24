create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  tiny_id text unique,
  customer text not null,
  description text,
  value numeric not null,
  issue_date date,
  due_date date not null,
  received_at date,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_receivables_due on receivables(due_date);
create index if not exists idx_receivables_tiny_id on receivables(tiny_id);

-- Também adiciona tiny_id na tabela payables se não existir
alter table payables add column if not exists tiny_id text unique;
create index if not exists idx_payables_tiny_id on payables(tiny_id);

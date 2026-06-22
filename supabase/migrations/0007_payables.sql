create table if not exists payables (
  id uuid primary key default gen_random_uuid(),
  supplier text not null,
  description text,
  value numeric not null,
  issue_date date not null,
  due_date date not null,
  paid_at date,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_payables_due on payables(due_date);

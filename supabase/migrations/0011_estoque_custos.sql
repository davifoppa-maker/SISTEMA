create table if not exists estoque_custos (
  nome text primary key,
  custo numeric not null,
  updated_at timestamptz not null default now()
);

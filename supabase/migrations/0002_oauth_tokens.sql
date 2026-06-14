-- Pós Venda Exx — armazenamento de tokens OAuth (Olist Tiny e futuros provedores).
-- Os tokens precisam persistir fora do processo porque o app roda em ambiente
-- serverless (Vercel), onde a memória é descartada entre invocações.

create table if not exists oauth_tokens (
  provider text primary key,            -- 'tiny', etc.
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,               -- validade do access_token
  scope text,
  obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

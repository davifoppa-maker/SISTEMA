-- Pós Venda Exx — sessão do WhatsApp Web (worker Baileys).
-- Guarda as credenciais/keys da sessão como um único JSON (texto), para a
-- conexão sobreviver a reinícios do worker sem precisar reescanear o QR Code.

create table if not exists whatsapp_sessions (
  id text primary key,
  data text,
  updated_at timestamptz not null default now()
);

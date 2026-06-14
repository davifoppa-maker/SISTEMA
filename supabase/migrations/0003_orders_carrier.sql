-- Pós Venda Exx — coluna de transportadora no pedido (vinda do payload do Tiny).
-- Exibida na coluna "Transportadora" da tela de Pedidos e usada para resolver a
-- transportadora da expedição (Checkout) automaticamente.

alter table orders add column if not exists carrier_name text;

-- Pós Venda Exx — número e chave de acesso da NF no pedido.
-- Preenchidos puxando a nota fiscal do pedido (detalhe → idNotaFiscal → /notas/{id}).
-- Usados na coluna "NF" de Pedidos e para identificar o pedido ao bipar no Checkout.

alter table orders add column if not exists nf_numero text;
alter table orders add column if not exists nf_chave text;
create index if not exists idx_orders_nf_chave on orders(nf_chave);

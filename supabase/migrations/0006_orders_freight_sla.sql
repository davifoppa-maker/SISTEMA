-- Pós Venda Exx — frete e prazo (data prevista de entrega) do pedido.
-- Capturados do Tiny (detalhe do pedido: valorFrete e dataPrevista), quando a NF
-- é gerada. expected_delivery_at vira o prazo (SLA / data ideal de entrega).

alter table orders add column if not exists freight_value numeric;
alter table orders add column if not exists expected_delivery_at timestamptz;

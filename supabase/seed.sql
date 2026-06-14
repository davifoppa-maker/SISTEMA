-- Pós Venda Exx — seeds para o Supabase (produção/staging).
-- Os pedidos de exemplo com NF e volumes são gerados pela aplicação em modo
-- simulação (src/lib/db/seed.ts). Aqui ficam os dados de configuração essenciais.

-- Usuários internos
insert into users (name, email, role) values
  ('Renato (Admin)', 'admin@exxnutrition.com.br', 'admin'),
  ('Expedição', 'expedicao@exxnutrition.com.br', 'operador')
on conflict (email) do nothing;

-- Transportadoras
insert into carriers (name, mode, tracking_url_template, default_sla_days, portal_instructions) values
  ('Braspress', 'manual', 'https://www.braspress.com/', 5, 'Consultar por CNPJ + NF no site.'),
  ('Rodonaves', 'manual', 'https://www.rodonaves.com.br/rastreio-de-mercadoria', 4, 'Rastreio por NF/CNPJ.'),
  ('Jadlog', 'portal', 'https://www.jadlog.com.br/tracking?cte={{tracking_code}}', 6, 'Tracking por código CTE.'),
  ('Correios', 'portal', 'https://rastreamento.correios.com.br/app/index.php?objeto={{tracking_code}}', 8, 'Rastreio por código do objeto.'),
  ('J&T', 'manual', 'https://www.jtexpress.com.br/trajectoryQuery?billcode={{tracking_code}}', 7, null),
  ('Expresso São Miguel', 'manual', null, 4, 'Validar API com gerente de conta.'),
  ('Arlete', 'manual', null, 5, 'Manual assistido até validação de EDI/API.'),
  ('Lenoir', 'manual', null, 5, 'Confirmar transportadora correta.')
on conflict do nothing;

-- Regras de detecção de canal
insert into channel_detection_rules (name, source, json_path, operator, expected_value, result_channel, priority) values
  ('Origem contém Mercos → B2B', 'tiny', 'ecommerce.nome', 'contains', 'Mercos', 'b2b_mercos', 10),
  ('Marcador Mercos → B2B', 'tiny', 'marcadores.0.descricao', 'contains', 'Mercos', 'b2b_mercos', 20),
  ('Marcador Nuvemshop → B2C', 'tiny', 'marcadores.0.descricao', 'contains', 'Nuvemshop', 'b2c_nuvemshop', 30),
  ('Origem contém Nuvemshop → B2C', 'tiny', 'ecommerce.nome', 'contains', 'Nuvem', 'b2c_nuvemshop', 40)
on conflict do nothing;

-- Templates de WhatsApp
insert into message_templates (key, name, body, trigger, audience, active) values
  ('pedido_coletado', 'Coleta confirmada', 'Olá {{cliente_nome}}! Seu pedido Exx Nutrition foi coletado pela transportadora {{transportadora}}. Acompanhe pela NF/CNPJ ou pelo link: {{link_rastreio}}.', 'EXPEDICAO_COLETADA', 'cliente', true),
  ('rastreio_disponivel', 'Rastreio disponível', 'Seu pedido já tem rastreio. Código: {{codigo_rastreio}}. Consulte em {{link_rastreio}}.', 'RASTREIO_DISPONIVEL', 'cliente', true),
  ('previsao_amanha', 'Previsão para amanhã', 'Seu pedido está com previsão de entrega para amanhã. Qualquer divergência, nosso time já está acompanhando por aqui.', 'PREVISAO_1D', 'cliente', false),
  ('pedido_entregue', 'Entrega confirmada', 'Seu pedido foi entregue. Conferiu se chegou tudo certinho?', 'PEDIDO_ENTREGUE', 'cliente', true),
  ('pos_entrega_7d', 'Pós-entrega 7 dias', 'Quer que eu te envie materiais de divulgação dos produtos para ajudar a vender mais rápido?', 'POS_ENTREGA_7D', 'cliente', false),
  ('pos_entrega_15d', 'Pós-entrega 15-25 dias', 'Como está o giro dos produtos? Posso te ajudar a montar uma reposição ou campanha?', 'POS_ENTREGA_15D', 'cliente', false)
on conflict (key) do nothing;

-- Regras de automação
insert into automation_rules (key, name, trigger, action, active, config) values
  ('pedido_criado', 'Pedido criado', 'WEBHOOK_TINY_ORDER', 'upsert_order_customer', true, '{}'),
  ('nf_emitida', 'NF emitida', 'WEBHOOK_TINY_INVOICE', 'activate_logistics', true, '{}'),
  ('coleta_confirmada', 'Coleta confirmada', 'EXPEDICAO_COLETADA', 'start_sla_and_notify', true, '{"send_whatsapp": true}'),
  ('sem_rastreio', 'Sem rastreio após X horas', 'CRON_TRACKING_CHECK', 'create_alert', true, '{"hours": 24}'),
  ('entrega_em_risco', 'Entrega em risco', 'CRON_SLA_CHECK', 'create_alert', true, '{"risk_window_hours": 24}'),
  ('atrasado', 'Atrasado', 'CRON_SLA_CHECK', 'create_occurrence', true, '{"notify_customer": false}'),
  ('entregue', 'Entregue', 'PEDIDO_ENTREGUE', 'notify_and_task', true, '{}')
on conflict (key) do nothing;

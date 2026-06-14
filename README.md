# Pós Venda Exx — Logística & Pós-venda

Camada de **controle logístico e pós-venda** da Exx Nutrition sobre o **Olist Tiny**.
O Tiny continua sendo o ERP principal; este sistema resolve o problema de saber
**quando o pedido realmente saiu fisicamente** (coleta real por bipagem), quando
começa o prazo real da transportadora e quais pedidos precisam de ação antes de o
cliente reclamar.

> **Decisão central:** o início oficial do SLA logístico é a **coleta real
> confirmada por bipagem** no Checkout de Expedição — **nunca** o status "enviado"
> do Tiny.

## Stack
Next.js 14 (App Router, TypeScript) · Tailwind CSS · Zod · Vitest ·
Supabase (produção) · Meta WhatsApp Cloud API (produção).

## Como rodar (modo simulação — sem credenciais)
```bash
cp .env.example .env   # opcional; o app roda sem credenciais
npm install
npm run dev            # http://localhost:3000
npm test               # testes de SLA, canal e idempotência
```
O app sobe com um **store em memória** já populado (8 transportadoras, regras de
canal, templates e 6 pedidos de exemplo com NF e volumes). É o driver `memory`.

## Modo produção (Supabase)
1. Crie um projeto no Supabase e rode `supabase/migrations/0001_init.sql`.
2. Carregue `supabase/seed.sql` (configurações: transportadoras, regras, templates,
   automações).
3. Configure `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (e demais
   variáveis em `.env.example`). O driver passa a `supabase`.
4. As tabelas do Postgres espelham as coleções de `DataStore` (snake_case); a
   migração da camada de dados consiste em reimplementar `getStore()`/serviços com
   o client de `src/lib/db/supabase-store.ts`.

## Conectar ao Olist Tiny (API V3 — OAuth2)
O Tiny V3 usa OAuth2 sobre um servidor Keycloak. Passos:

1. No portal de desenvolvedores do Tiny, **registre um aplicativo** e copie o
   `client_id` e o `client_secret`. Cadastre o **redirect URI** como
   `https://SEU_DOMINIO/api/auth/tiny/callback`.
2. Configure no ambiente (Vercel ou `.env`):
   `TINY_CLIENT_ID`, `TINY_CLIENT_SECRET`, `TINY_REDIRECT_URI` e `APP_URL`.
   Os endpoints (`TINY_AUTH_URL`, `TINY_TOKEN_URL`, `TINY_API_BASE_URL`,
   `TINY_ORDERS_PATH`, `TINY_SCOPE`) já têm defaults e só precisam ser
   sobrescritos se a Olist mudar host/caminho.
3. Acesse **/settings** e clique em **Conectar ao Olist Tiny** (rota
   `/api/auth/tiny/login`). Após autorizar, o callback troca o `code` por
   `access_token`/`refresh_token` e os persiste (em `oauth_tokens` no Supabase;
   o refresh é automático).
4. Sincronize pedidos: `POST /api/sync/tiny/recent` (sem corpo busca na API V3;
   com um array no corpo faz replay/simulação) e `POST /api/sync/tiny/order/:id`.

> Os tokens precisam de armazenamento durável porque a Vercel é serverless.
> Rode `supabase/migrations/0002_oauth_tokens.sql` antes de conectar em produção.
> O mapeamento do payload da V3 (`mapV3OrderToPayload`) é tolerante e guarda o
> bruto; pode pedir ajuste fino após inspecionar o primeiro pedido real.

## Deploy na Vercel
1. Importe o repositório na Vercel (framework Next.js, detectado automaticamente).
2. Configure as variáveis de ambiente a partir de `.env.example` (no mínimo as do
   Supabase, as `TINY_*` e `APP_URL` com o domínio final).
3. O `vercel.json` já agenda o cron de SLA (`/api/cron/sla-check`, a cada 2h) —
   crons exigem plano Pro. Proteja o endpoint com `CRON_SECRET`.
4. Após o primeiro deploy, ajuste `APP_URL`/`TINY_REDIRECT_URI` para o domínio
   publicado e cadastre esse redirect URI no app do Tiny; então conecte em
   **/settings**.

## Arquitetura
- **Eventos e idempotência:** webhooks salvam o payload bruto em `webhook_events`
  com `idempotency_key` e respondem rápido. Reprocesso não duplica pedido/evento/
  volume/mensagem.
- **Serviços por domínio** (`src/lib/services`): `tiny`, `channel`, `sla`,
  `whatsapp`, `carrier`, `automation`, `dashboard`.
- **Regras configuráveis:** canal B2B/B2C (`channel_detection_rules`), automações
  (`automation_rules`), SLAs e transportadoras — nada hardcoded.
- **Transportadoras plugáveis:** adaptador genérico (`carrier.ts`) com modos
  `manual`/`portal` implementados e `api`/`edi`/`hub` preparados.

## Fluxo operacional
Pedido entra no Tiny → importa → identifica canal B2B/B2C → NF emitida → ativa
logística → **expedição bipada (coleta real)** → SLA começa oficialmente → WhatsApp
de expedição → rastreio/alertas → ocorrência se necessário → pós-entrega.

## Telas
Dashboard · Pedidos · Detalhe do pedido · Payload bruto (+ regras de canal) ·
Checkout de expedição (bipagem) · Lotes de coleta · Transportadoras · Ocorrências ·
WhatsApp · Cotação manual · Clientes B2B · Configurações · Login.

## Principais rotas de API
| Rota | Método | Função |
|---|---|---|
| `/api/webhooks/tiny/orders` | POST | Receber criação/alteração de pedido |
| `/api/webhooks/tiny/invoices` | POST | NF emitida → ativa logística |
| `/api/webhooks/meta` | GET/POST | Verificação e status/mensagens WhatsApp |
| `/api/auth/tiny/login` | GET | Inicia o OAuth2 do Olist Tiny (redirect) |
| `/api/auth/tiny/callback` | GET | Recebe o code, troca por tokens e persiste |
| `/api/auth/tiny/status` | GET | Status da conexão (configurado/conectado) |
| `/api/sync/tiny/recent` | POST | Ressincronizar (sem corpo = API V3; array = replay) |
| `/api/sync/tiny/order/:id` | POST | Ressincronizar um pedido (API V3 quando conectado) |
| `/api/admin/raw-events` | GET | Listar payloads brutos |
| `/api/checkout` | GET/POST | Buscar expedições / finalizar coleta (bipagem) |
| `/api/channel-rules` | GET/POST | Regras de canal (PATCH/DELETE em `/:id`) |
| `/api/messages/send` | POST | Envio manual de WhatsApp |
| `/api/conversations/:customerId` | GET | Histórico de conversa |
| `/api/cron/sla-check` | GET/POST | Job de SLA/rastreio (Vercel Cron) |

## Teste rápido dos critérios de aceite
1. Abra **/raw-payload** → "Simular pedido Tiny (Mercos)" → veja o JSON bruto e a
   classificação B2B pela regra.
2. Emita uma NF de teste:
   ```bash
   curl -X POST localhost:3000/api/webhooks/tiny/invoices \
     -H 'content-type: application/json' \
     -d '{"pedido_numero":"10001","numero":"NF10001","serie":"1","volumes":3,"transportadora":"Braspress"}'
   ```
3. Abra **/checkout** → selecione o pedido → bipe os volumes → finalize. O status
   vira `coletado`, o **SLA inicia pela coleta real** e o WhatsApp de expedição é
   registrado em **/whatsapp**.
4. **/dashboard** mostra aguardando coleta, coletados hoje, em trânsito, em risco,
   atrasados, valor em trânsito e o ranking por transportadora.

## O bridge antigo
O middleware Express (GoAffPro ↔ Nuvemshop) foi movido para `legacy/` apenas como
referência conceitual (webhooks, HMAC, templates).

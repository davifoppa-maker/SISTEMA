# WhatsApp Worker — Pós Venda Exx

Serviço **sempre-ligado** que conecta o WhatsApp Web (Baileys) por **QR Code** e
dispara as mensagens do sistema pelo WhatsApp da empresa (a Bárbara escaneia).
A sessão é salva no **Supabase** (tabela `whatsapp_sessions`), então sobrevive a
reinícios sem precisar reescanear.

> ⚠️ Não roda na Vercel (serverless). Rode no **Railway** (sempre-ligado).

## Deploy no Railway (passo a passo)

1. Acesse **railway.app** e entre com o GitHub.
2. **New Project → Deploy from GitHub repo** → escolha o repositório `pos-venda-exx`.
3. Em **Settings → Root Directory**, coloque: `whatsapp-worker`
   (assim o Railway builda só esta pasta, não o site).
4. O start é automático (`npm start`). Em **Settings → Networking**, clique em
   **Generate Domain** para obter a URL pública (ex.: `https://xxxx.up.railway.app`).
5. Em **Variables**, adicione:

| Variável | Valor |
|---|---|
| `WORKER_TOKEN` | uma senha aleatória forte (a mesma que vai no app) |
| `SUPABASE_URL` | a Project URL do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | a chave service_role do Supabase 🔒 |
| `SESSION_ID` | `exx` |

6. Antes de tudo, rode a migration no Supabase (SQL Editor):
   ```sql
   create table if not exists whatsapp_sessions (
     id text primary key, data text, updated_at timestamptz not null default now()
   );
   ```

## Ligar no app (Vercel)

No projeto da Vercel, adicione as variáveis e faça **Redeploy**:

| Variável | Valor |
|---|---|
| `WHATSAPP_WORKER_URL` | a URL pública do Railway |
| `WHATSAPP_WORKER_TOKEN` | o mesmo `WORKER_TOKEN` do worker |

## Conectar o WhatsApp

Abra **/whatsapp** no sistema → aparece o **QR Code** → no celular da empresa:
WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** → aponte para o QR.
Status fica **Conectado** e os envios passam a sair por esse WhatsApp.

## API (uso interno do app)

- `GET /status` → `{ connected, hasQr, qr, me }` (header `x-worker-token`)
- `POST /send` → `{ to, message, media_url? }` (header `x-worker-token`)
- `POST /logout` → encerra a sessão (gera novo QR)

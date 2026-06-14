# Pós Venda Exx — Passo a passo para colocar no ar (para iniciantes)

Guia sem jargão para publicar o sistema na **Vercel**, ligar o **Supabase** (banco)
e conectar no **Olist Tiny**. Faça **um passo de cada vez**.

> Visão geral do caminho:
> **Supabase** (banco) → **Vercel** (publicar o site) → **Variáveis** (configurar) →
> **Olist** (autorizar) → **pronto**.

---

## Etapa 1 — Criar o banco no Supabase

1. Acesse **https://supabase.com** e crie uma conta (pode usar o Google).
2. Clique em **New project**.
   - **Name:** `pos-venda-exx`
   - **Database Password:** crie uma senha forte e **guarde** (pode anotar num gerenciador).
   - **Region:** escolha **South America (São Paulo)**.
3. Clique em **Create new project** e aguarde uns 2 minutos (ele "provisiona").

## Etapa 2 — Criar as tabelas (rodar o SQL)

1. No menu lateral do Supabase, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo **`supabase/setup-completo.sql`** deste projeto, copie **todo** o
   conteúdo e cole na caixa do SQL Editor.
4. Clique em **Run** (ou Ctrl/Cmd + Enter). Deve aparecer **Success**.
   - Esse arquivo é seguro de rodar mais de uma vez.

## Etapa 3 — Copiar as chaves do Supabase

1. No Supabase, vá em **Project Settings** (engrenagem) → **API**.
2. Você vai precisar de **3 valores** (copie para um bloco de notas temporário):
   - **Project URL** → vira `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (em *Project API keys*) → vira `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (clique em *Reveal*) → vira `SUPABASE_SERVICE_ROLE_KEY`
     > ⚠️ A `service_role` é **muito poderosa**. Nunca poste em lugar público nem
     > coloque dentro do código. Ela só vai no painel da Vercel.

---

## Etapa 4 — Publicar na Vercel (importar do GitHub)

1. Acesse **https://vercel.com** e entre com **GitHub**.
2. Clique em **Add New… → Project**.
3. Em **Import Git Repository**, procure por **`pos-venda-exx`** e clique **Import**.
   - Se o repositório não aparecer, clique em **Adjust GitHub App Permissions** e
     dê acesso à organização `goaffpro-nuvemshop-bridge`.
4. A Vercel detecta **Next.js** sozinho. **Não mude** nada de build.
5. **Antes de clicar em Deploy**, abra **Environment Variables** e adicione as da
   lista da Etapa 5 (pode adicionar `APP_URL`/`TINY_REDIRECT_URI` depois).
6. Clique em **Deploy** e aguarde. No fim aparece a **URL** do site
   (ex.: `https://pos-venda-exx.vercel.app`). **Anote essa URL.**

## Etapa 5 — Variáveis de ambiente (no painel da Vercel)

Em **Settings → Environment Variables**, adicione cada uma (Environment: **Production**):

| Nome | Valor | De onde vem |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | *(Project URL)* | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(anon public)* | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | *(service_role)* | Supabase → Settings → API |
| `TINY_CLIENT_ID` | *(seu client_id)* | App no portal do Olist Tiny |
| `TINY_CLIENT_SECRET` | *(seu client_secret)* | App no portal do Olist Tiny |
| `APP_URL` | `https://SUA-URL.vercel.app` | a URL da Etapa 4 |
| `TINY_REDIRECT_URI` | `https://SUA-URL.vercel.app/api/auth/tiny/callback` | a URL da Etapa 4 |
| `CRON_SECRET` | *(uma senha aleatória qualquer)* | você inventa |

> Depois de adicionar/alterar variáveis, faça um **Redeploy**
> (aba **Deployments** → menu `…` no topo → **Redeploy**).

## Etapa 6 — Registrar o redirect no Olist Tiny

1. No portal de desenvolvedores do Olist Tiny, abra o **seu aplicativo**.
2. No campo de **Redirect URI / URL de callback**, coloque **exatamente**:
   `https://SUA-URL.vercel.app/api/auth/tiny/callback`
3. Salve.

## Etapa 7 — Conectar 🎉

1. Acesse `https://SUA-URL.vercel.app/settings`.
2. Clique em **Conectar ao Olist Tiny** e autorize.
3. Se aparecer **"Olist Tiny conectado com sucesso"**, está ligado!
4. Para puxar pedidos, o time técnico aciona `POST /api/sync/tiny/recent`
   (a importação durável de pedidos entra na Fase 2 — migração completa do banco).

---

### Dúvidas comuns
- **"O repositório não aparece na Vercel."** → dê permissão do GitHub App à
  organização `goaffpro-nuvemshop-bridge` (Etapa 4, item 3).
- **"Deu erro ao conectar o Tiny (state_invalido / redirect)."** → confira se o
  `TINY_REDIRECT_URI` na Vercel é **idêntico** ao cadastrado no Olist e se houve
  **Redeploy** após salvar as variáveis.
- **Plano do cron:** o agendamento de SLA (`vercel.json`) exige **Vercel Pro**.

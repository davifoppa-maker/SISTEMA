# LP Banco de Talentos — Nyer Nutrition

Landing page de captação contínua de talentos (Brusque/SC). Arquivo **único e
autocontido**: `index.html` (HTML + CSS + JS embutidos, logo em base64). Sem
framework, sem build. **Não faz parte do app de estoque** deste repositório —
é hospedada à parte, num servidor estático.

## Como funciona
- 4 vagas fixas (Comercial, Expedição, Financeiro, Produção) + "Zona Sênior".
- Clicar numa zona já seleciona a vaga no formulário e abre a pergunta de
  triagem específica daquela área.
- Requisitos travados: mora em Brusque/região (bloqueia o envio se "Não") e
  checkbox de compromisso (obrigatório).

## Envio do formulário
`fetch POST` (JSON) direto pro webhook do n8n:

```
https://nyernutrition.app.n8n.cloud/webhook/nyer-talentos-candidatura
```

Fluxo n8n "LP Banco de Talentos - Candidaturas": Webhook → Set → Google Sheets
(append) na planilha **Nyer Nutrition - Candidaturas Banco de Talentos**, aba
"Candidaturas". Credencial dedicada `SHEET CANDIDATURA` (não mexer nas
credenciais do fluxo antigo do Facebook Lead Ads).

## Deploy (HostGator / cPanel)
Domínio `nyertrabalheconosco.com` já com DNS apontando pro servidor HostGator
(registro A → `162.241.63.72`).

1. cPanel → **Gerenciador de Arquivos** → `public_html` (ou a subpasta do addon
   domain, se a conta tiver mais de um domínio).
2. Subir **`index.html`** (o próprio arquivo desta pasta).
3. Confirmar SSL em cPanel → **SSL/TLS Status** (AutoSSL costuma ser automático).

Como é um único arquivo estático, qualquer host estático serve (HostGator,
Netlify, Vercel, GitHub Pages) — basta que `index.html` seja a raiz.

## Teste rápido local
```
# na pasta lp-talentos/
python3 -m http.server 8080
# abrir http://localhost:8080
```

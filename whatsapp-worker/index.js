// Worker do WhatsApp Web (Baileys) — Pós Venda Exx.
// Mantém uma sessão do WhatsApp viva (login por QR Code), persistida no Supabase,
// e expõe uma API mínima para o app (Vercel) disparar mensagens.
//
// Endpoints (todos exigem header x-worker-token == WORKER_TOKEN, exceto "/"):
//   GET  /         -> healthcheck
//   GET  /status   -> { connected, state, hasQr, qr(dataURL|null), me }
//   POST /send     -> { to, message, media_url? } envia a mensagem
//
// Variáveis de ambiente:
//   WORKER_TOKEN                 segredo compartilhado com o app (obrigatório)
//   SUPABASE_URL                 URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY    chave de serviço (persiste a sessão)
//   SESSION_ID                   id da sessão (default "exx")
//   PORT                         porta HTTP (o Railway injeta)

import express from "express";
import qrcode from "qrcode";
import pino from "pino";
import { WebSocket as NodeWebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
  proto,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";

// O cliente do Supabase espera um WebSocket global (existe nativo só no Node 22+).
// Garantimos um para funcionar também no Node 20.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = NodeWebSocket;
}

const WORKER_TOKEN = process.env.WORKER_TOKEN || "";
const SESSION_ID = process.env.SESSION_ID || "exx";
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const logger = pino({ level: "silent" });

// ───────────────── Persistência da sessão no Supabase ─────────────────
// Guarda { creds, keys } como um único JSON (texto) na tabela whatsapp_sessions.
async function useSupabaseAuthState() {
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("data")
    .eq("id", SESSION_ID)
    .maybeSingle();

  let creds;
  let keys = {};
  if (data?.data) {
    const parsed = JSON.parse(data.data, BufferJSON.reviver);
    creds = parsed.creds;
    keys = parsed.keys || {};
  } else {
    creds = initAuthCreds();
  }

  const persist = async () => {
    const serialized = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    await supabase
      .from("whatsapp_sessions")
      .upsert({ id: SESSION_ID, data: serialized, updated_at: new Date().toISOString() }, { onConflict: "id" });
  };

  const state = {
    creds,
    keys: {
      get: (type, ids) => {
        const result = {};
        for (const id of ids) {
          let value = keys[`${type}-${id}`];
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          result[id] = value;
        }
        return result;
      },
      set: async (dataSet) => {
        for (const type in dataSet) {
          for (const id in dataSet[type]) {
            const value = dataSet[type][id];
            const key = `${type}-${id}`;
            if (value) keys[key] = value;
            else delete keys[key];
          }
        }
        await persist();
      },
    },
  };

  return { state, saveCreds: persist, clear: async () => {
    keys = {};
    await supabase.from("whatsapp_sessions").delete().eq("id", SESSION_ID);
  } };
}

// ───────────────── Conexão WhatsApp ─────────────────
let sock = null;
let latestQr = null;
let connectionState = "connecting"; // connecting | open | close
let meUser = null;
let authRef = null;

async function startSock() {
  const { state, saveCreds, clear } = await useSupabaseAuthState();
  authRef = { clear };
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Pos Venda Exx", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) latestQr = qr;
    if (connection) connectionState = connection;
    if (connection === "open") {
      latestQr = null;
      meUser = sock.user || null;
      console.log("WhatsApp conectado:", meUser?.id);
    }
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log("Conexão fechada. status=", statusCode, "loggedOut=", loggedOut);
      if (loggedOut) {
        // Sessão encerrada: limpa e recomeça (gera novo QR).
        meUser = null;
        await authRef.clear().catch(() => {});
        setTimeout(startSock, 1500);
      } else {
        // Queda temporária: reconecta mantendo a sessão.
        setTimeout(startSock, 2500);
      }
    }
  });

  return sock;
}

// ───────────────── Envio ─────────────────
function toJid(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  // Sem código do país (10-11 dígitos = BR) → prefixa 55.
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `${withCountry}@s.whatsapp.net`;
}

async function sendMessage({ to, message, media_url }) {
  if (!sock || connectionState !== "open") {
    throw new Error("WhatsApp não conectado. Escaneie o QR Code.");
  }
  let jid = toJid(to);
  if (!jid) throw new Error("Número inválido.");

  // Resolve o JID real (corrige o 9º dígito quando necessário).
  try {
    const [res] = await sock.onWhatsApp(jid);
    if (res?.exists && res.jid) jid = res.jid;
    else if (res && !res.exists) throw new Error(`Número ${to} não está no WhatsApp.`);
  } catch (e) {
    if (e.message?.includes("não está no WhatsApp")) throw e;
    // se onWhatsApp falhar por outro motivo, segue com o jid montado
  }

  if (media_url) {
    // Tenta anexar a NF como PDF. Se o link não devolver um PDF de verdade
    // (ex.: página HTML de visualização), cai para texto + link.
    let nfLink = media_url; // URL final (após redirects) p/ o fallback
    try {
      const resp = await fetch(media_url, { redirect: "follow" });
      if (resp.url) nfLink = resp.url;
      if (!resp.ok) throw new Error(`download ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const contentType = (resp.headers.get("content-type") || "").toLowerCase();
      const isPdf =
        contentType.includes("application/pdf") ||
        (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "%PDF");
      if (isPdf) {
        const sent = await sock.sendMessage(jid, {
          document: buffer,
          mimetype: "application/pdf",
          fileName: "nota-fiscal.pdf",
          caption: message || undefined,
        });
        return sent?.key?.id || "sent";
      }
    } catch (e) {
      console.warn("Anexo NF indisponível, enviando como link:", e?.message || e);
    }
    // Fallback: texto + link final da NF (a página da DANFE abre/salva ao clicar).
    const text = `${message || ""}\n\nNota fiscal: ${nfLink}`.trim();
    const sentFallback = await sock.sendMessage(jid, { text });
    return sentFallback?.key?.id || "sent";
  }

  const sent = await sock.sendMessage(jid, { text: message });
  return sent?.key?.id || "sent";
}

// ───────────────── HTTP ─────────────────
const app = express();
app.use(express.json({ limit: "2mb" }));

function requireToken(req, res, next) {
  if (!WORKER_TOKEN || req.header("x-worker-token") !== WORKER_TOKEN) {
    return res.status(401).json({ ok: false, error: "Não autorizado" });
  }
  next();
}

app.get("/", (_req, res) => res.json({ ok: true, service: "whatsapp-worker", state: connectionState }));

app.get("/status", requireToken, async (_req, res) => {
  let qrDataUrl = null;
  if (latestQr) {
    try { qrDataUrl = await qrcode.toDataURL(latestQr); } catch { /* ignore */ }
  }
  res.json({
    ok: true,
    connected: connectionState === "open",
    state: connectionState,
    hasQr: Boolean(latestQr),
    qr: qrDataUrl,
    me: meUser?.id ?? null,
  });
});

app.post("/send", requireToken, async (req, res) => {
  try {
    const id = await sendMessage(req.body || {});
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ ok: false, error: e instanceof Error ? e.message : "erro" });
  }
});

app.post("/logout", requireToken, async (_req, res) => {
  try {
    await sock?.logout().catch(() => {});
    await authRef?.clear().catch(() => {});
    res.json({ ok: true });
    setTimeout(startSock, 1000);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(PORT, () => console.log(`whatsapp-worker ouvindo na porta ${PORT}`));
startSock().catch((e) => console.error("Falha ao iniciar:", e));

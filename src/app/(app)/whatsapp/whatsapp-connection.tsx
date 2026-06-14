"use client";

import { useCallback, useEffect, useState } from "react";

interface Status {
  configured?: boolean;
  connected?: boolean;
  state?: string;
  hasQr?: boolean;
  qr?: string | null;
  me?: string | null;
}

export function WhatsAppConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setStatus(json.data);
        setError(null);
      } else {
        setError(json.error ?? "Falha ao consultar o worker.");
      }
    } catch {
      setError("Worker do WhatsApp indisponível.");
    }
  }, []);

  async function disconnect() {
    if (!confirm("Desconectar o WhatsApp? Será preciso escanear o QR Code novamente para reconectar.")) {
      return;
    }
    setDisconnecting(true);
    try {
      await fetch("/api/whatsapp/logout", { method: "POST" });
    } catch {
      /* ignore */
    } finally {
      setDisconnecting(false);
      setTimeout(load, 1500);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000); // atualiza p/ pegar o QR / conexão
    return () => clearInterval(t);
  }, [load]);

  if (status && status.configured === false) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Worker do WhatsApp ainda não configurado. Defina <code>WHATSAPP_WORKER_URL</code> e{" "}
        <code>WHATSAPP_WORKER_TOKEN</code> e publique o worker no Railway.
      </div>
    );
  }

  const connected = status?.connected;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            connected ? "bg-emerald-500" : status?.hasQr ? "bg-amber-500" : "bg-slate-300"
          }`}
        />
        <span className="font-medium">
          {connected ? "Conectado" : status?.hasQr ? "Aguardando leitura do QR" : "Conectando…"}
        </span>
        {connected && status?.me ? (
          <span className="text-xs text-slate-500">({status.me.split(":")[0]})</span>
        ) : null}
        {connected ? (
          <button
            onClick={disconnect}
            disabled={disconnecting}
            className="ml-auto rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {disconnecting ? "Desconectando…" : "Desconectar"}
          </button>
        ) : null}
      </div>

      {!connected && status?.qr ? (
        <div className="flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={status.qr} alt="QR Code do WhatsApp" className="h-56 w-56 rounded-lg border border-slate-200" />
          <p className="text-center text-xs text-slate-500">
            No celular da empresa: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar um aparelho</b> → aponte para este QR Code.
          </p>
        </div>
      ) : null}

      {!connected && !status?.qr && !error ? (
        <p className="text-xs text-slate-400">Gerando QR Code… aguarde alguns segundos.</p>
      ) : null}

      {connected ? (
        <p className="text-xs text-emerald-600">Pronto! As mensagens serão enviadas por este WhatsApp.</p>
      ) : null}

      {error ? <p className="text-xs text-amber-600">{error}</p> : null}
    </div>
  );
}

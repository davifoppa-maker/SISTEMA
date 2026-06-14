"use client";

import { useState } from "react";

// Botão para enviar a NF (DANFE) do pedido pelo WhatsApp do cliente.
export function SendNfButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/messages/send-nf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId }),
      });
      const json = await res.json();
      setMsg(
        res.ok && json.ok
          ? { ok: true, text: `NF enviada para ${json.data?.phone ?? "o cliente"}.` }
          : { ok: false, text: json.error ?? "Falha ao enviar a NF." },
      );
    } catch {
      setMsg({ ok: false, text: "Falha de rede ao enviar." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        onClick={send}
        disabled={loading}
        className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {loading ? "Enviando…" : "Enviar NF no WhatsApp"}
      </button>
      {msg ? <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-amber-600"}`}>{msg.text}</p> : null}
    </div>
  );
}

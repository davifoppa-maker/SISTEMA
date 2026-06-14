"use client";

import { useState } from "react";

interface QueueItem {
  id: string;
  content: string;
  phone: string | null;
  order_number: string | null;
  customer_name: string | null;
}

export function ApprovalQueue({ items }: { items: QueueItem[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.content])),
  );
  const [phones, setPhones] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.phone ?? ""])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function approve(id: string) {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch("/api/messages/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: drafts[id], phone: phones[id] }),
      });
      const json = await res.json();
      if (json.ok && json.data?.status === "sent") {
        setDone((d) => ({ ...d, [id]: json.data?.attachedNf ? "✓ Enviada com NF" : "✓ Enviada" }));
      } else {
        // Falha que NÃO remove da fila (ex.: sem telefone) → mostra inline e deixa reenviar.
        setErrors((e) => ({ ...e, [id]: json.data?.error ?? json.error ?? "Falha ao enviar." }));
      }
    } catch {
      setErrors((e) => ({ ...e, [id]: "Falha de rede. Tente novamente." }));
    } finally {
      setBusy(null);
    }
  }

  async function discard(id: string) {
    setBusy(id);
    try {
      await fetch("/api/messages/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDone((d) => ({ ...d, [id]: "Descartada" }));
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma mensagem aguardando aprovação.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((i) => (
        <div key={i.id} className="rounded-lg border border-slate-200 p-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">
              {i.customer_name ?? "Cliente"}{i.order_number ? ` · #${i.order_number}` : ""}
            </span>
          </div>
          {done[i.id] ? (
            <p className={`text-sm ${done[i.id].startsWith("✓") ? "text-emerald-600" : "text-amber-600"}`}>{done[i.id]}</p>
          ) : (
            <>
              <textarea
                value={drafts[i.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                rows={3}
                className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
              <div className="mb-2">
                <label className="text-xs text-slate-500">Telefone (com DDD)</label>
                <input
                  value={phones[i.id] ?? ""}
                  onChange={(e) => setPhones((p) => ({ ...p, [i.id]: e.target.value }))}
                  placeholder="ex.: 48999990000"
                  className={`w-full rounded-lg border p-2 text-sm ${
                    errors[i.id] ? "border-amber-400 bg-amber-50" : "border-slate-300"
                  }`}
                />
              </div>
              {errors[i.id] ? <p className="mb-2 text-xs text-amber-600">{errors[i.id]}</p> : null}
              <div className="flex gap-2">
                <button
                  onClick={() => approve(i.id)}
                  disabled={busy === i.id}
                  className="rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-60"
                >
                  {busy === i.id ? "Enviando…" : "Aprovar e enviar (com NF)"}
                </button>
                <button
                  onClick={() => discard(i.id)}
                  disabled={busy === i.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

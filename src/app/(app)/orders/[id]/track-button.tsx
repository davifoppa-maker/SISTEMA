"use client";

import { useState } from "react";

interface TrackingEvent {
  data?: string;
  descricao?: string;
  local?: string;
}
interface TrackingShipment {
  status?: string;
  numero?: string;
  origem?: string;
  destino?: string;
  previsaoEntrega?: string;
  dataEntrega?: string;
  ultimaOcorrencia?: string;
  entregue?: boolean;
  timeline: TrackingEvent[];
}

// Rastreia a carga na transportadora DO PEDIDO (resolvida pelo campo
// "Transportadora"). Cada uma usa um identificador: Braspress = número da NF;
// Arlete (SSW) = chave da NF-e; Jadlog = código de rastreio (shipmentId).
export function TrackButton({
  providerId,
  providerLabel,
  nf,
  chave,
  trackingCode,
}: {
  providerId: string | null;
  providerLabel: string | null;
  nf: string | null;
  chave: string | null;
  trackingCode: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shipments, setShipments] = useState<TrackingShipment[] | null>(null);

  // Identificador conforme a transportadora do pedido.
  const identifier = providerId === "arlete" ? chave : providerId === "jadlog" ? trackingCode : nf;

  async function track() {
    if (!providerId || !identifier) return;
    setLoading(true);
    setError(null);
    setShipments(null);
    try {
      const res = await fetch(`/api/tracking/${providerId}?nf=${encodeURIComponent(identifier)}`);
      const json = await res.json();
      if (res.ok && json.ok) {
        setShipments(json.data?.shipments ?? []);
      } else {
        setError(json.error ?? "Falha ao rastrear.");
      }
    } catch {
      setError("Falha de rede ao rastrear.");
    } finally {
      setLoading(false);
    }
  }

  if (!providerId) {
    return <p className="mt-2 text-xs text-slate-400">Esta transportadora não tem rastreio automático.</p>;
  }
  if (!identifier) {
    return (
      <p className="mt-2 text-xs text-amber-700">
        Rastreio {providerLabel ?? ""} indisponível: falta {providerId === "arlete" ? "a chave da NF-e" : providerId === "jadlog" ? "o código de rastreio (shipmentId)" : "o número da NF"} neste pedido.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={track}
        disabled={loading}
        className="inline-block rounded-lg border border-brand-700 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {loading ? "Rastreando…" : `Rastrear${providerLabel ? ` (${providerLabel})` : ""}`}
      </button>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}

      {shipments && shipments.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma informação de rastreio para este pedido.</p>
      ) : null}

      {shipments?.map((s, i) => (
        <div key={i} className="rounded-lg border border-slate-100 p-2 text-xs">
          {s.status ? (
            <p className="font-semibold text-brand-800">{s.status}</p>
          ) : null}
          {s.origem || s.destino ? (
            <p className="text-slate-600">{[s.origem, s.destino].filter(Boolean).join(" → ")}</p>
          ) : null}
          {s.previsaoEntrega ? <p className="text-slate-500">Previsão: {s.previsaoEntrega}</p> : null}
          {s.dataEntrega ? <p className="text-emerald-700">Entregue em: {s.dataEntrega}</p> : null}

          {s.timeline?.length ? (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              {s.timeline.map((e, j) => (
                <li key={j} className="flex gap-2">
                  <span className="shrink-0 text-slate-400">{e.data ?? "—"}</span>
                  <span className="text-slate-700">
                    {e.descricao ?? "—"}
                    {e.local ? <span className="text-slate-400"> · {e.local}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

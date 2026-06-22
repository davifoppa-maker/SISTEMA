"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export function SyncItemsButton({ orderId, hasItems }: { orderId: string; hasItems: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function handleSync() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/orders/sync-items?orderId=${orderId}`, { method: "POST" });
      const body = await res.json();
      if (body.ok) {
        setMsg({ text: body.message, type: "success" });
        setTimeout(() => router.refresh(), 1000);
      } else {
        setMsg({ text: body.error || "Erro desconhecido", type: "error" });
      }
    } catch {
      setMsg({ text: "Erro de rede", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  if (hasItems) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sincronizando..." : "Buscar itens do Tiny"}
      </button>
      {msg && (
        <span className={`text-xs ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

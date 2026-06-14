"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface Tpl {
  id: string;
  key: string;
  name: string;
  body: string;
  audience: string;
  active: boolean;
}

export function TemplateEditor({ templates }: { templates: Tpl[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(templates.map((t) => [t.id, t.body])),
  );
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(id: string) {
    setBusy(id);
    setSavedId(null);
    try {
      const res = await fetch(`/api/messages/templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: drafts[id] }),
      });
      if (res.ok) {
        setSavedId(id);
        setTimeout(() => setSavedId(null), 2000);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {templates.map((t) => (
        <div key={t.id} className="rounded-lg border border-slate-200 p-2 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium">{t.name}</span>
            <Badge variant={t.active ? "success" : "muted"}>{t.active ? "ativo" : "inativo"}</Badge>
          </div>
          <textarea
            value={drafts[t.id] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 p-2 text-xs"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => save(t.id)}
              disabled={busy === t.id}
              className="rounded-lg border border-brand-700 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
            >
              {busy === t.id ? "Salvando…" : "Salvar"}
            </button>
            {savedId === t.id ? <span className="text-xs text-emerald-600">✓ salvo</span> : null}
            <span className="text-[10px] text-slate-400">Variáveis: {"{{cliente_nome}}"}, {"{{transportadora}}"}, {"{{link_rastreio}}"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

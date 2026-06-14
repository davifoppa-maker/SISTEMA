"use client";

import { useState } from "react";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Carrier {
  id: string;
  name: string;
  mode: string;
  default_sla_days: number;
  tracking_url_template: string | null;
  portal_instructions: string | null;
}

const modeVariant: Record<string, Parameters<typeof Badge>[0]["variant"]> = {
  manual: "muted",
  portal: "info",
  api: "success",
  edi: "warning",
  hub: "info",
};

export function CarriersClient({ carriers }: { carriers: Carrier[] }) {
  const [rows, setRows] = useState<Carrier[]>(carriers);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function saveSla(id: string, value: number) {
    setSavingId(id);
    setSavedId(null);
    try {
      const res = await fetch(`/api/carriers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_sla_days: value }),
      });
      if (res.ok) {
        setSavedId(id);
        setTimeout(() => setSavedId(null), 2000);
      }
    } finally {
      setSavingId(null);
    }
  }

  function setLocal(id: string, value: number) {
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, default_sla_days: value } : c)));
  }

  return (
    <Table>
      <Thead>
        <tr>
          <Th>Transportadora</Th>
          <Th>Modo</Th>
          <Th>SLA fallback (dias)</Th>
          <Th>Rastreio</Th>
          <Th>Instruções</Th>
        </tr>
      </Thead>
      <tbody>
        {rows.map((c) => (
          <Tr key={c.id}>
            <Td className="font-medium">{c.name}</Td>
            <Td><Badge variant={modeVariant[c.mode] ?? "muted"}>{c.mode}</Badge></Td>
            <Td>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={c.default_sla_days}
                  onChange={(e) => setLocal(c.id, Number(e.target.value))}
                  onBlur={(e) => saveSla(c.id, Number(e.target.value))}
                  className="h-8 w-16 rounded-lg border border-slate-300 px-2 text-sm"
                />
                {savingId === c.id ? <span className="text-xs text-slate-400">salvando…</span> : null}
                {savedId === c.id ? <span className="text-xs text-emerald-600">✓ salvo</span> : null}
              </div>
            </Td>
            <Td className="max-w-[240px] truncate text-xs text-slate-500">{c.tracking_url_template ?? "sem rastreio"}</Td>
            <Td className="max-w-[220px] truncate text-xs text-slate-500">{c.portal_instructions ?? "—"}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

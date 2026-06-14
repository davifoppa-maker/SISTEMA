"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ShipmentResult {
  shipment_id: string;
  status: string;
  order_number: string;
  customer_name: string;
  carrier_id: string | null;
  carrier_name: string | null;
  nf_numero: string | null;
  nf_chave: string | null;
}
interface Carrier {
  id: string;
  name: string;
  default_sla_days: number;
}
interface Scan {
  uid: string;
  code: string;
  shipment_id: string;
  order_number: string;
}

const SEM_TRANSP = "Sem transportadora";

export function CheckoutClient({ carriers }: { carriers: Carrier[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShipmentResult[]>([]);
  const [openCarrier, setOpenCarrier] = useState<string | null>(null);
  // Sessão de checkout: transportadora ativa (definida ao clicar no grupo ou
  // pela 1ª caixa bipada) e os volumes bipados de vários pedidos.
  const [sessionCarrier, setSessionCarrier] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [motorista, setMotorista] = useState("");
  const [notes, setNotes] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const [updatingNf, setUpdatingNf] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  async function search() {
    const res = await fetch(`/api/checkout?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    setResults(json.data ?? []);
  }

  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ShipmentResult[]>();
    for (const r of results) {
      if (r.status !== "aguardando_coleta") continue;
      const key = r.carrier_name ?? SEM_TRANSP;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [results]);

  // Volumes agrupados por pedido (para exibir e finalizar em lote).
  const byOrder = useMemo(() => {
    const map = new Map<string, { order_number: string; codes: string[] }>();
    for (const s of scans) {
      const e = map.get(s.shipment_id) ?? { order_number: s.order_number, codes: [] };
      e.codes.push(s.code);
      map.set(s.shipment_id, e);
    }
    return [...map.entries()].map(([shipment_id, v]) => ({ shipment_id, ...v }));
  }, [scans]);

  function resetSession() {
    setScans([]);
    setSessionCarrier(null);
    setMotorista("");
    setNotes("");
  }

  function focusScan() {
    setTimeout(() => scanRef.current?.focus(), 20);
  }

  // Bipou a chave/nº da NF / nº do pedido → identifica o pedido e soma 1 volume.
  function handleScan(raw: string) {
    const code = raw.trim();
    setScanInput("");
    focusScan();
    if (!code) return;
    const norm = code.toLowerCase();

    const found = results.find(
      (r) =>
        r.status === "aguardando_coleta" &&
        ((r.nf_chave && r.nf_chave === code) ||
          (r.nf_numero && r.nf_numero === code) ||
          (r.order_number && r.order_number.toLowerCase() === norm)),
    );

    if (!found) {
      setMessage({ type: "err", text: `Não encontrei pedido/NF para "${code}". Confira ou atualize os pedidos.` });
      return;
    }

    const carrier = found.carrier_name ?? SEM_TRANSP;

    // Define a transportadora da sessão na 1ª bipagem (se ainda não houver).
    if (!sessionCarrier) {
      setSessionCarrier(carrier);
    } else if (carrier !== sessionCarrier) {
      // Caixa de OUTRA transportadora no meio → alerta e NÃO conta.
      setPopup(
        `⚠️ Atenção: esta caixa é da transportadora "${carrier}" (pedido #${found.order_number}), e não "${sessionCarrier}". ` +
          `Separe essa caixa — ela não pertence a esta expedição.`,
      );
      return;
    }

    setScans((prev) => [
      ...prev,
      { uid: `${Date.now()}-${prev.length}-${Math.random()}`, code, shipment_id: found.shipment_id, order_number: found.order_number },
    ]);
    setMessage({ type: "ok", text: `Volume bipado — pedido #${found.order_number} (${carrier}).` });
  }

  function startCarrierSession(carrier: string) {
    if (scans.length > 0 && carrier !== sessionCarrier) {
      setMessage({ type: "err", text: "Finalize ou limpe a expedição atual antes de trocar de transportadora." });
      return;
    }
    setSessionCarrier(carrier);
    setOpenCarrier(carrier);
    setMessage({ type: "ok", text: `Expedição de ${carrier}. Bipe as caixas.` });
    focusScan();
  }

  function removeScan(uid: string) {
    setScans((prev) => {
      const next = prev.filter((s) => s.uid !== uid);
      if (next.length === 0) setSessionCarrier(null);
      return next;
    });
  }

  function removeOrder(shipmentId: string) {
    setScans((prev) => {
      const next = prev.filter((s) => s.shipment_id !== shipmentId);
      if (next.length === 0) setSessionCarrier(null);
      return next;
    });
  }

  async function updateNFs() {
    setUpdatingNf(true);
    try {
      const res = await fetch("/api/sync/tiny/nf", { method: "POST" });
      const json = await res.json();
      setMessage(
        json.ok
          ? { type: "ok", text: `${json.data?.enriched ?? 0} nota(s) fiscal(is) atualizada(s).` }
          : { type: "err", text: json.error ?? "Falha ao atualizar NFs." },
      );
      await search();
    } catch {
      setMessage({ type: "err", text: "Falha ao atualizar NFs." });
    } finally {
      setUpdatingNf(false);
    }
  }

  async function finalize() {
    if (byOrder.length === 0) {
      setMessage({ type: "err", text: "Bipe ao menos 1 volume antes de finalizar." });
      return;
    }
    // Transportadora da sessão (id/nome) a partir do 1º pedido bipado.
    const firstShipment = results.find((r) => r.shipment_id === byOrder[0].shipment_id);
    setFinalizing(true);
    try {
      const res = await fetch("/api/checkout/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: byOrder.map((o) => ({ shipment_id: o.shipment_id, scanned_codes: o.codes })),
          carrier_id: firstShipment?.carrier_id ?? null,
          carrier_name: firstShipment?.carrier_name ?? sessionCarrier,
          collector_name: motorista || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage({ type: "err", text: json.error ?? "Falha ao finalizar." });
        return;
      }
      const totalVol = scans.length;
      setMessage({
        type: "ok",
        text: `Coleta confirmada! ${byOrder.length} pedido(s) · ${totalVol} volume(s) — ${sessionCarrier}. SLA iniciado.`,
      });
      resetSession();
      void search();
    } catch {
      setMessage({ type: "err", text: "Falha de rede ao finalizar." });
    } finally {
      setFinalizing(false);
    }
  }

  const totalVolumes = scans.length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Pop-up de transportadora errada */}
      {popup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setPopup(null); focusScan(); }}>
          <div className="max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-slate-700">{popup}</p>
            <button
              onClick={() => { setPopup(null); focusScan(); }}
              className="mt-4 w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Entendi
            </button>
          </div>
        </div>
      ) : null}

      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Expedição por transportadora</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); void search(); }} className="flex gap-2">
            <Input placeholder="Pedido, cliente, transportadora…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" size="sm">Buscar</Button>
          </form>

          <button
            onClick={updateNFs}
            disabled={updatingNf}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {updatingNf ? "Atualizando NFs…" : "Atualizar notas fiscais (puxar do Tiny)"}
          </button>

          <p className="text-xs text-slate-400">Clique na transportadora para iniciar a expedição dela, ou simplesmente comece a bipar.</p>

          <div className="space-y-2">
            {groups.map(([carrier, orders]) => (
              <div key={carrier} className={`rounded-lg border ${sessionCarrier === carrier ? "border-brand-500 ring-1 ring-brand-200" : "border-slate-200"}`}>
                <button
                  onClick={() => startCarrierSession(carrier)}
                  className="flex w-full items-center justify-between p-2 text-left text-sm font-medium hover:bg-slate-50"
                >
                  <span>🚚 {carrier}{sessionCarrier === carrier ? " · expedindo" : ""}</span>
                  <Badge variant="info">{orders.length}</Badge>
                </button>
                <div className="border-t border-slate-100 p-1">
                  {orders.map((r) => {
                    const vols = scans.filter((s) => s.shipment_id === r.shipment_id).length;
                    return (
                      <div
                        key={r.shipment_id}
                        className={`mb-1 w-full rounded-md border p-2 text-left text-sm ${vols > 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-100"}`}
                      >
                        <div className="font-medium">#{r.order_number}{r.nf_numero ? ` · NF ${r.nf_numero}` : ""} {vols > 0 ? <span className="text-emerald-700">· {vols} vol</span> : null}</div>
                        <div className="text-xs text-slate-500">{r.customer_name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {groups.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Nenhum pedido B2B aguardando coleta.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Checkout de Expedição{sessionCarrier ? ` · ${sessionCarrier}` : ""}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className={`rounded-lg p-2 text-sm ${message.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </div>
          ) : null}

          <div>
            <Label>Bipar chave da NF · ou nº do pedido / nº da NF</Label>
            <form onSubmit={(e) => { e.preventDefault(); handleScan(scanInput); }}>
              <Input ref={scanRef} autoFocus placeholder="Bipe a chave da NF ou digite o nº do pedido…" value={scanInput} onChange={(e) => setScanInput(e.target.value)} />
            </form>
            <p className="mt-1 text-xs text-slate-400">
              Bipe as caixas misturadas da transportadora — o sistema agrupa por pedido (cada bipe = 1 volume). Caixa de outra transportadora gera alerta.
            </p>
          </div>

          {byOrder.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Comece a bipar as caixas (ou clique numa transportadora à esquerda).</p>
          ) : (
            <>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-medium">Expedindo {sessionCarrier} — {byOrder.length} pedido(s), {totalVolumes} volume(s)</div>
              </div>

              <div className="space-y-2">
                {byOrder.map((o) => (
                  <div key={o.shipment_id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">#{o.order_number} · {o.codes.length} volume(s)</span>
                      <button onClick={() => removeOrder(o.shipment_id)} className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-100" title="Remover pedido">remover</button>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {scans.filter((s) => s.shipment_id === o.shipment_id).map((s, i) => (
                        <span key={s.uid} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600">
                          Vol {i + 1}
                          <button onClick={() => removeScan(s.uid)} className="text-red-500" title="Remover volume">✕</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Motorista / coletor (opcional)</Label>
                  <Input value={motorista} onChange={(e) => setMotorista(e.target.value)} placeholder="Nome" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={finalize} disabled={finalizing} className="flex-1">
                  {finalizing ? "Finalizando…" : `Finalizar coleta (${byOrder.length} pedido${byOrder.length === 1 ? "" : "s"} · ${totalVolumes} vol)`}
                </Button>
                <button onClick={resetSession} className="rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">
                  Limpar
                </button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

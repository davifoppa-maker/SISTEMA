"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface WebhookEvent {
  id: string;
  source: string;
  event_type: string;
  status: string;
  received_at: string;
  payload: unknown;
}
interface Rule {
  id: string;
  name: string;
  json_path: string;
  operator: string;
  expected_value: string | null;
  result_channel: string;
  priority: number;
  active: boolean;
}

const sampleOrder = {
  id: "tiny-99001",
  numero: "99001",
  numero_ecommerce: "MERCOS-99001",
  situacao: "aprovado",
  valor: 2500,
  ecommerce: { nome: "Mercos" },
  marcadores: [{ descricao: "Atacado/Mercos" }],
  cliente: { nome: "Cliente Teste B2B", cpf_cnpj: "10.000.000/0001-00", fone: "5547999990099", cidade: "Blumenau", uf: "SC" },
  vendedor: "Equipe B2B",
  lista_preco: "Atacado",
  itens: [{ codigo: "WHEY-900", descricao: "Whey Protein 900g", quantidade: 10, valor_unitario: 120 }],
};

export function RawPayloadClient() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    json_path: "ecommerce.nome",
    operator: "contains",
    expected_value: "Mercos",
    result_channel: "b2b_mercos",
    priority: 50,
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [e, r] = await Promise.all([
      fetch("/api/admin/raw-events").then((x) => x.json()),
      fetch("/api/channel-rules").then((x) => x.json()),
    ]);
    setEvents(e.data ?? []);
    setRules(r.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function simulate() {
    setBusy(true);
    await fetch("/api/webhooks/tiny/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sampleOrder, numero: String(90000 + Math.floor(Math.random() * 9999)) }),
    });
    await load();
    setBusy(false);
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/channel-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ ...form, name: "" });
    await load();
  }

  async function toggle(rule: Rule) {
    await fetch(`/api/channel-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/channel-rules/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Regras de detecção de canal</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-slate-500">
            Configuráveis (tabela channel_detection_rules). A primeira regra ativa, por prioridade crescente, que casar com o payload define o canal.
          </p>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    <code>{r.json_path}</code> {r.operator} <code>{r.expected_value}</code> → {r.result_channel} · prio {r.priority}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.active ? "success" : "muted"}>{r.active ? "ativa" : "inativa"}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => toggle(r)}>{r.active ? "Desativar" : "Ativar"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Excluir</Button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={createRule} className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-3">
            <div className="col-span-2 md:col-span-1">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Origem Mercos → B2B" required />
            </div>
            <div>
              <Label>Campo (json_path)</Label>
              <Input value={form.json_path} onChange={(e) => setForm({ ...form, json_path: e.target.value })} />
            </div>
            <div>
              <Label>Operador</Label>
              <Select value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
                {["equals", "contains", "starts_with", "ends_with", "regex", "exists"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Valor esperado</Label>
              <Input value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} />
            </div>
            <div>
              <Label>Canal resultante</Label>
              <Select value={form.result_channel} onChange={(e) => setForm({ ...form, result_channel: e.target.value })}>
                {["b2b_mercos", "b2c_nuvemshop", "mercado_livre", "manual", "indefinido"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
            </div>
            <div className="col-span-2 flex items-end md:col-span-3">
              <Button type="submit">Adicionar regra</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payloads brutos recebidos</CardTitle>
          <Button size="sm" onClick={simulate} disabled={busy}>
            {busy ? "Simulando…" : "Simular pedido Tiny (Mercos)"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Nenhum evento. Simule um pedido para gerar o payload bruto.</p>
          ) : null}
          {events.map((ev) => (
            <div key={ev.id} className="rounded-lg border border-slate-200">
              <button
                onClick={() => setOpen(open === ev.id ? null : ev.id)}
                className="flex w-full items-center justify-between p-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="info">{ev.source}</Badge>
                  <span className="font-medium">{ev.event_type}</span>
                  <span className="text-xs text-slate-400">{new Date(ev.received_at).toLocaleString("pt-BR")}</span>
                </span>
                <Badge variant={ev.status === "processed" ? "success" : ev.status === "error" ? "danger" : "muted"}>{ev.status}</Badge>
              </button>
              {open === ev.id ? (
                <pre className="max-h-80 overflow-auto rounded-b-lg bg-slate-900 p-3 text-xs text-slate-100">
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

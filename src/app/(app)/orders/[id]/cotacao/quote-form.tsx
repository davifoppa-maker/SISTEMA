"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { brl } from "@/lib/utils/format";
import {
  CubagemEditor,
  emptyCubagemRow,
  totalVolumes as sumVolumes,
  cubagemToPayload,
  type CubagemRow,
} from "@/components/cubagem-editor";

interface Prefill {
  cnpjRemetente: string;
  cepOrigem: string;
  cnpjDestinatario: string;
  cepDestino: string;
  vlrMercadoria: number;
  peso: number;
  volumes: number;
  empresa?: string;
}

interface Result {
  totalFrete?: number;
  prazo?: number;
  validade?: string;
}

interface QuoteRow {
  id: string;
  label: string;
  ok: boolean;
  totalFrete?: number;
  prazo?: number;
  error?: string;
}

interface ProviderOption {
  id: string;
  label: string;
  configured: boolean;
}

interface CubagemAuto {
  linhas: { altura: string; largura: string; comprimento: string; volumes: string }[];
  caixas: { nome: string; quantidade: number }[];
  volumeItensM3: number;
  semMedida: { sku: string | null; descricao: string }[];
  alertas: string[];
}

export function QuoteForm({
  orderId,
  prefill,
  providers,
  cubagemAuto,
}: {
  orderId: string;
  prefill: Prefill;
  providers: ProviderOption[];
  cubagemAuto?: CubagemAuto;
}) {
  const [cnpjRemetente, setCnpjRemetente] = useState(prefill.cnpjRemetente);
  const [cepOrigem, setCepOrigem] = useState(prefill.cepOrigem);
  const [cnpjDestinatario, setCnpjDestinatario] = useState(prefill.cnpjDestinatario);
  const [cepDestino, setCepDestino] = useState(prefill.cepDestino);
  const [vlrMercadoria, setVlrMercadoria] = useState(String(prefill.vlrMercadoria ?? ""));
  const [peso, setPeso] = useState(String(prefill.peso || ""));
  const [modal, setModal] = useState("R");
  const [tipoFrete, setTipoFrete] = useState("1");
  const [cubagem, setCubagem] = useState<CubagemRow[]>(
    cubagemAuto && cubagemAuto.linhas.length > 0
      ? cubagemAuto.linhas.map((l) => ({
          altura: l.altura,
          largura: l.largura,
          comprimento: l.comprimento,
          volumes: l.volumes,
        }))
      : [emptyCubagemRow(String(prefill.volumes || 1))],
  );

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolumes = sumVolumes(cubagem);

  // Cota em TODAS as transportadoras configuradas de uma vez e ranqueia pela
  // mais barata. Não há escolha manual — a mais barata é a recomendada.
  async function submit() {
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const cubagemPayload = cubagemToPayload(cubagem).filter(
        (d) => d.altura > 0 && d.largura > 0 && d.comprimento > 0 && d.volumes > 0,
      );
      const payload = {
        cnpjRemetente,
        cepOrigem,
        cnpjDestinatario,
        cepDestino,
        vlrMercadoria: Number(vlrMercadoria.replace(",", ".")) || 0,
        peso: Number(peso.replace(",", ".")) || 0,
        volumes: totalVolumes,
        modal,
        tipoFrete,
        empresa: prefill.empresa,
        cubagem: cubagemPayload.length > 0 ? cubagemPayload : [{ altura: 0.1, largura: 0.1, comprimento: 0.1, volumes: totalVolumes }],
      };

      const ativos = providers.filter((p) => p.configured);
      if (ativos.length === 0) {
        setError("Nenhuma transportadora configurada.");
        return;
      }

      const resultados = await Promise.all(
        ativos.map(async (p): Promise<QuoteRow> => {
          try {
            const res = await fetch(`/api/cotacao/${p.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (res.ok && json.ok) {
              const d = json.data as Result;
              return { id: p.id, label: p.label, ok: true, totalFrete: d.totalFrete, prazo: d.prazo };
            }
            return { id: p.id, label: p.label, ok: false, error: json.error ?? "Falha ao cotar." };
          } catch {
            return { id: p.id, label: p.label, ok: false, error: "Falha de rede." };
          }
        }),
      );

      // Sucessos primeiro, do mais barato ao mais caro; erros por último.
      resultados.sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        return (a.totalFrete ?? Infinity) - (b.totalFrete ?? Infinity);
      });
      setRows(resultados);
      if (!resultados.some((r) => r.ok)) setError("Nenhuma transportadora retornou cotação.");
    } catch {
      setError("Falha de rede ao cotar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader><CardTitle>Remetente ({prefill.empresa === "ecopro" ? "Ecopro" : "NRX"})</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CNPJ remetente"><Input value={cnpjRemetente} onChange={(e) => setCnpjRemetente(e.target.value)} /></Field>
            <Field label="CEP origem"><Input value={cepOrigem} onChange={(e) => setCepOrigem(e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Destinatário (cliente do pedido)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CNPJ/CPF destinatário"><Input value={cnpjDestinatario} onChange={(e) => setCnpjDestinatario(e.target.value)} /></Field>
            <Field label="CEP destino"><Input value={cepDestino} onChange={(e) => setCepDestino(e.target.value)} /></Field>
            <Field label="Valor da mercadoria (R$)"><Input value={vlrMercadoria} onChange={(e) => setVlrMercadoria(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Peso total (kg)"><Input value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Modal">
              <Select value={modal} onChange={(e) => setModal(e.target.value)}>
                <option value="R">Rodoviário</option>
                <option value="A">Aéreo</option>
              </Select>
            </Field>
            <Field label="Tipo de frete">
              <Select value={tipoFrete} onChange={(e) => setTipoFrete(e.target.value)}>
                <option value="1">CIF (remetente paga)</option>
                <option value="2">FOB (destinatário paga)</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volumes e dimensões ({totalVolumes} no total)</CardTitle>
          </CardHeader>
          <CardContent>
            {cubagemAuto && (cubagemAuto.caixas.length > 0 || cubagemAuto.semMedida.length > 0) ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                <div className="font-medium text-emerald-800">📦 Cubagem automática (pelos itens do pedido)</div>
                {cubagemAuto.caixas.length > 0 ? (
                  <p className="text-slate-700">
                    {cubagemAuto.caixas.map((c) => `${c.quantidade}× ${c.nome}`).join(" + ")}
                    {" · volume dos itens ~"}
                    {cubagemAuto.volumeItensM3.toFixed(3)} m³
                  </p>
                ) : null}
                {cubagemAuto.semMedida.length > 0 ? (
                  <div className="mt-2 rounded bg-amber-50 p-2 text-amber-800">
                    ⚠️ Sem medida na base (produto novo — cadastrar):
                    <ul className="ml-4 list-disc">
                      {cubagemAuto.semMedida.map((s, i) => (
                        <li key={i}>
                          {s.descricao} (SKU {s.sku ?? "?"})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {cubagemAuto.alertas.map((a, i) => (
                  <p key={i} className="mt-1 text-amber-700">
                    ⚠️ {a}
                  </p>
                ))}
                <p className="mt-2 text-xs text-slate-500">
                  As caixas abaixo já vêm preenchidas — ajuste se precisar antes de cotar.
                </p>
              </div>
            ) : null}
            <CubagemEditor rows={cubagem} onChange={setCubagem} />
          </CardContent>
        </Card>

        <Button onClick={submit} disabled={loading} className="w-full sm:w-auto">
          {loading ? "Cotando em todas…" : "Cotar em todas as transportadoras"}
        </Button>
      </div>

      <div>
        <Card>
          <CardHeader><CardTitle>Melhor frete</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!rows && !error ? <p className="text-slate-400">Clique em “Cotar em todas as transportadoras”. A mais barata aparece no topo.</p> : null}
            {error && !rows ? <p className="rounded-lg bg-red-50 p-2 text-red-700">{error}</p> : null}
            {rows ? (
              <div className="space-y-1">
                {rows.map((r, i) => {
                  const isBest = r.ok && i === 0;
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${
                        isBest ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                      } ${!r.ok ? "opacity-70" : ""}`}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-slate-700">
                        {r.label}
                        {isBest ? <span className="rounded bg-emerald-600 px-1.5 text-[10px] font-semibold text-white">MAIS BARATA</span> : null}
                      </span>
                      {r.ok ? (
                        <span className="text-right">
                          <span className={`font-semibold ${isBest ? "text-emerald-700" : "text-slate-700"}`}>
                            {r.totalFrete != null ? brl(r.totalFrete) : "—"}
                          </span>
                          <span className="block text-[11px] text-slate-500">{r.prazo != null ? `${r.prazo} dia(s)` : "prazo —"}</span>
                        </span>
                      ) : (
                        <span className="max-w-[55%] truncate text-right text-xs text-amber-700">{r.error}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

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
}

interface Result {
  totalFrete?: number;
  prazo?: number;
  validade?: string;
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
  const [provider, setProvider] = useState(providers[0]?.id ?? "braspress");
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
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalVolumes = sumVolumes(cubagem);

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
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
        cubagem: cubagemToPayload(cubagem),
      };
      const res = await fetch(`/api/cotacao/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setResult(json.data as Result);
      } else {
        setError(json.error ?? "Falha ao cotar.");
      }
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
          <CardHeader><CardTitle>Remetente (NRX)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Transportadora">
              <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <div className="hidden sm:block" />
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
          {loading ? "Cotando…" : "Fazer cotação"}
        </Button>
      </div>

      <div>
        <Card>
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!result && !error ? <p className="text-slate-400">Preencha os volumes/dimensões e clique em “Fazer cotação”.</p> : null}
            {error ? <p className="rounded-lg bg-red-50 p-2 text-red-700">{error}</p> : null}
            {result ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Valor do frete</span>
                  <span className="text-lg font-semibold text-emerald-700">{result.totalFrete != null ? brl(result.totalFrete) : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Prazo</span>
                  <span className="font-medium">{result.prazo != null ? `${result.prazo} dia(s)` : "—"}</span>
                </div>
                {result.validade ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Validade</span>
                    <span className="text-xs">{result.validade}</span>
                  </div>
                ) : null}
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { brl } from "@/lib/utils/format";
import {
  CubagemEditor,
  emptyCubagemRow,
  totalVolumes as sumVolumes,
  cubagemToPayload,
  cubagemToText,
  type CubagemRow,
} from "@/components/cubagem-editor";

export interface CubagemAuto {
  linhas: { altura: string; largura: string; comprimento: string; volumes: string }[];
  caixas: { nome: string; quantidade: number }[];
  volumeItensM3: number;
  semMedida: { sku: string | null; descricao: string }[];
  alertas: string[];
  totalCaixas: number;
}

export interface QuoteOrderOption {
  id: string;
  order_number: string;
  customer_name: string;
  customer_document: string;
  city: string;
  state: string;
  total_value: number;
  volumes: number;
  weight: number;
  cubagem?: CubagemAuto;
}

export interface ProviderOption {
  id: string;
  label: string;
  configured: boolean;
}

interface QuoteRow {
  id: string;
  label: string;
  ok: boolean;
  totalFrete?: number;
  prazo?: number;
  error?: string;
}

// Dados fixos do remetente (NRX).
const ORIGEM = {
  nome: "NRX",
  cnpj: "51.579.683/0001-14",
  cidade: "Braço do Norte/SC",
  cep: "88352-501",
};

export function QuotesClient({ orders, providers }: { orders: QuoteOrderOption[]; providers: ProviderOption[] }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const order = orders.find((o) => o.id === orderId);
  const [cubagem, setCubagem] = useState<CubagemRow[]>([emptyCubagemRow("1")]);
  const [cubagemInfo, setCubagemInfo] = useState<CubagemAuto | null>(null);
  const [cubagemLoading, setCubagemLoading] = useState(false);
  const [cubagemErro, setCubagemErro] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [copied, setCopied] = useState(false);
  const [quotedValue, setQuotedValue] = useState("");
  const [quotedDays, setQuotedDays] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingErr, setSavingErr] = useState<string | null>(null);
  const [tinyMsg, setTinyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tinyDebug, setTinyDebug] = useState<string | null>(null);

  // Cotação automática — todas as transportadoras de uma vez.
  const [cotando, setCotando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [results, setResults] = useState<QuoteRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Peso bruto e CEP de destino puxados do Tiny (sob demanda, ao selecionar).
  const [pesoBruto, setPesoBruto] = useState<number | null>(null);
  const [cepDestino, setCepDestino] = useState<string | null>(null);
  const [pesoLoading, setPesoLoading] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setPesoBruto(null);
      setCepDestino(null);
      return;
    }
    let cancelled = false;
    setPesoLoading(true);
    setPesoBruto(null);
    setCepDestino(null);
    fetch(`/api/quotes/weight?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setPesoBruto(j?.ok && typeof j.data?.pesoBruto === "number" ? j.data.pesoBruto : null);
        setCepDestino(j?.ok && j.data?.cepDestino ? String(j.data.cepDestino) : null);
      })
      .catch(() => {
        if (!cancelled) {
          setPesoBruto(null);
          setCepDestino(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPesoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // Pré-preenche os volumes/dimensões com a cubagem automática ao trocar de pedido.
  // Instantâneo com o que veio pré-calculado da página; depois refina buscando os
  // itens do pedido no Tiny (a listagem não traz itens; o detalhe sim) via API.
  useEffect(() => {
    const o = orders.find((x) => x.id === orderId);
    const inicial = o?.cubagem ?? null;
    setCubagemInfo(inicial);
    setCubagem(
      inicial && inicial.linhas.length > 0
        ? inicial.linhas.map((l) => ({ ...l }))
        : [emptyCubagemRow(String(o?.volumes ?? 1))],
    );
    if (!orderId) return;
    let cancelled = false;
    setCubagemLoading(true);
    setCubagemErro(null);
    fetch(`/api/quotes/cubagem?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) throw new Error(j?.error ?? "falha");
        const d = j.data as CubagemAuto & { itemCount?: number };
        setCubagemInfo(d);
        if (d.linhas?.length) setCubagem(d.linhas.map((l) => ({ ...l })));
        else if ((d.itemCount ?? 0) === 0) setCubagemErro("Nenhum item encontrado neste pedido (base/Tiny).");
      })
      .catch((e) => {
        if (!cancelled) setCubagemErro(e instanceof Error ? e.message : "erro ao calcular cubagem");
      })
      .finally(() => {
        if (!cancelled) setCubagemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, orders]);

  // Nº de volumes = soma das quantidades das linhas; se ainda não há linhas
  // preenchidas, usa o total do pedido.
  const rowsVolumes = sumVolumes(cubagem);
  const volumeCount = rowsVolumes > 0 ? rowsVolumes : (order?.volumes ?? 1);

  // Texto legível das medidas para o pacote de WhatsApp.
  const measuresText = cubagemToText(cubagem);

  // Peso exibido: peso bruto do Tiny quando disponível; senão estimativa local.
  const pesoLabel = pesoLoading
    ? "calculando…"
    : pesoBruto != null
      ? `${pesoBruto} kg`
      : `${order?.weight ?? 0} kg (estimado)`;

  const text = useMemo(() => {
    if (!order) return "";
    const pesoLinha = pesoBruto != null ? `${pesoBruto} kg` : `${order.weight} kg (estimado)`;
    const cepDest = cepDestino ?? "[CEP não informado no pedido]";
    return `Solicitação de cotação — ${ORIGEM.nome}

Remetente: ${ORIGEM.nome}
CNPJ: ${ORIGEM.cnpj}
Origem: ${ORIGEM.cidade} — CEP ${ORIGEM.cep}
Destinatário: ${order.customer_name}
CNPJ/CPF: ${order.customer_document}
Destino: ${order.city}/${order.state} — CEP ${cepDest}
Valor da NF: R$ ${order.total_value.toFixed(2)}
Volumes: ${volumeCount}
Peso bruto: ${pesoLinha}
Medidas dos volumes: ${measuresText || "—"}
Observações: ${obs || "—"}`;
  }, [order, measuresText, obs, pesoBruto, cepDestino, volumeCount]);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function whatsapp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // Grava no pedido a transportadora escolhida + valor + prazo.
  async function registerQuote() {
    if (!order) return;
    setSavingErr(null);
    setTinyMsg(null);
    setTinyDebug(null);
    const chosen = (results ?? []).find((r) => r.id === selected);
    const transportadora = chosen?.label ?? "";
    if (!transportadora) {
      setSavingErr("Cote e selecione uma transportadora antes de registrar.");
      return;
    }
    try {
      const res = await fetch(`/api/orders/${order.id}/frete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportadora,
          provider: chosen?.id,
          valor: quotedValue,
          prazo: quotedDays,
          volumes: volumeCount,
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        const t = json.data?.tiny as
          | {
              attempted?: boolean;
              ok?: boolean;
              status?: number;
              body?: string;
              formaEnvioNome?: string | null;
              formasDisponiveis?: string[];
              transporteStatus?: number;
              transporte?: unknown;
              pedidoKeys?: string[];
              pedidoRaw?: string;
              getStatus?: number;
            }
          | undefined;
        setTinyDebug(t?.pedidoRaw ? `keys: ${(t.pedidoKeys ?? []).join(", ")}\n\n${t.pedidoRaw}` : null);
        if (t?.attempted) {
          if (t.ok) {
            setTinyMsg({
              ok: true,
              text: `Gravado no Tiny ✓ (PUT status ${t.transporteStatus ?? "?"}, leitura ${t.getStatus ?? "?"}). Confira transportador/valorFrete abaixo 👇`,
            });
          } else if (t.formaEnvioNome === null) {
            const disp = t.formasDisponiveis?.length
              ? ` Formas cadastradas no Tiny: ${t.formasDisponiveis.join(", ")}.`
              : "";
            setTinyMsg({ ok: false, text: `Nenhuma forma de envio do Tiny casou com "${transportadora}".${disp}` });
          } else {
            setTinyMsg({ ok: false, text: `Tiny respondeu (status ${t.status ?? "?"}): ${t.body ?? "sem corpo"}` });
          }
        }
      } else {
        setSavingErr(json.error ?? "Falha ao registrar.");
      }
    } catch {
      setSavingErr("Falha de rede ao registrar.");
    }
  }

  // Marca uma transportadora e joga o valor/prazo dela nos campos de registro.
  function escolher(r: QuoteRow) {
    if (!r.ok) return;
    setSelected(r.id);
    if (r.totalFrete != null) setQuotedValue(r.totalFrete.toFixed(2).replace(".", ","));
    setQuotedDays(r.prazo != null ? String(r.prazo) : "");
  }

  // Cota o frete em TODAS as transportadoras ao mesmo tempo e lista os resultados.
  async function cotarTodas() {
    if (!order) return;
    setAviso(null);
    setResults(null);
    setSelected(null);

    const payloadCubagem = cubagemToPayload(cubagem);
    if (!payloadCubagem.length) {
      setAviso("Informe ao menos uma dimensão (altura, largura e comprimento).");
      return;
    }
    if (!cepDestino) {
      setAviso("Pedido sem CEP de destino (não veio do Tiny). Não dá para cotar.");
      return;
    }

    const payload = {
      cnpjDestinatario: order.customer_document,
      cepDestino,
      vlrMercadoria: order.total_value,
      peso: pesoBruto ?? order.weight,
      volumes: volumeCount,
      cubagem: payloadCubagem,
    };

    const ativos = providers.filter((p) => p.configured);
    if (!ativos.length) {
      setAviso("Nenhuma transportadora configurada.");
      return;
    }

    setCotando(true);
    const rows = await Promise.all(
      ativos.map(async (p): Promise<QuoteRow> => {
        try {
          const res = await fetch(`/api/cotacao/${p.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (res.ok && json.ok) {
            const dt = json.data as { totalFrete?: number; prazo?: number };
            return { id: p.id, label: p.label, ok: true, totalFrete: dt.totalFrete, prazo: dt.prazo };
          }
          return { id: p.id, label: p.label, ok: false, error: json.error ?? "Falha ao cotar." };
        } catch {
          return { id: p.id, label: p.label, ok: false, error: "Falha de rede." };
        }
      }),
    );

    // Ordena: sucessos primeiro, do mais barato ao mais caro; erros por último.
    rows.sort((a, b) => {
      if (a.ok !== b.ok) return a.ok ? -1 : 1;
      return (a.totalFrete ?? Infinity) - (b.totalFrete ?? Infinity);
    });
    setResults(rows);

    // Pré-seleciona o mais barato com sucesso.
    const cheapest = rows.find((r) => r.ok && r.totalFrete != null);
    if (cheapest) escolher(cheapest);
    else setAviso("Nenhuma transportadora retornou cotação. Veja os detalhes abaixo.");

    setCotando(false);
  }

  // Menor frete e menor prazo entre os sucessos (para destacar na lista).
  const oks = (results ?? []).filter((r) => r.ok);
  const minFrete = oks.length ? Math.min(...oks.map((r) => r.totalFrete ?? Infinity)) : null;
  const minPrazo = oks.length ? Math.min(...oks.map((r) => r.prazo ?? Infinity)) : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Dados da cotação</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Pedido</Label>
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
              {orders.map((o) => (
                <option key={o.id} value={o.id}>#{o.order_number} — {o.customer_name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label>Volumes e dimensões ({volumeCount} no total)</Label>
            {orderId ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
                <div className="font-medium text-emerald-800">📦 Cubagem automática (pelos itens do pedido)</div>
                {cubagemLoading ? <p className="text-slate-600">Calculando…</p> : null}
                {!cubagemLoading && cubagemErro ? <p className="text-amber-700">⚠️ {cubagemErro}</p> : null}
                {!cubagemLoading && cubagemInfo && cubagemInfo.caixas.length > 0 ? (
                  <p className="text-slate-700">
                    {cubagemInfo.caixas.map((c) => `${c.quantidade}× ${c.nome}`).join(" + ")}
                    {" · volume dos itens ~"}
                    {cubagemInfo.volumeItensM3.toFixed(3)} m³
                  </p>
                ) : null}
                {!cubagemLoading && cubagemInfo && cubagemInfo.semMedida.length > 0 ? (
                  <div className="mt-2 rounded bg-amber-50 p-2 text-amber-800">
                    ⚠️ Sem medida na base (produto novo — cadastrar):
                    <ul className="ml-4 list-disc">
                      {cubagemInfo.semMedida.map((s, i) => (
                        <li key={i}>
                          {s.descricao} (SKU {s.sku ?? "?"})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {!cubagemLoading && cubagemInfo
                  ? cubagemInfo.alertas.map((a, i) => (
                      <p key={i} className="mt-1 text-amber-700">
                        ⚠️ {a}
                      </p>
                    ))
                  : null}
                {!cubagemLoading && cubagemInfo && cubagemInfo.caixas.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    As caixas abaixo já vêm preenchidas — ajuste se precisar antes de cotar.
                  </p>
                ) : null}
              </div>
            ) : null}
            <CubagemEditor rows={cubagem} onChange={setCubagem} />
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Peso bruto (Tiny): </span>
            <span className="font-medium text-slate-800">{pesoLabel}</span>
          </div>

          <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-brand-800">Cotação automática (todas as transportadoras)</span>
              <Button size="sm" onClick={cotarTodas} disabled={cotando}>
                {cotando ? "Cotando…" : "Cotar agora"}
              </Button>
            </div>

            {aviso ? <p className="text-xs text-amber-700">{aviso}</p> : null}

            {!results && !aviso ? (
              <p className="text-xs text-slate-500">
                Cota em todas as transportadoras de uma vez. Escolha uma na lista para registrar valor e prazo.
              </p>
            ) : null}

            {results ? (
              <div className="space-y-1">
                {results.map((r) => {
                  const isCheapest = r.ok && r.totalFrete != null && r.totalFrete === minFrete;
                  const isFastest = r.ok && r.prazo != null && r.prazo === minPrazo;
                  return (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${
                        selected === r.id ? "border-brand-600 bg-white" : "border-slate-200 bg-white/60"
                      } ${!r.ok ? "opacity-70" : ""}`}
                    >
                      <input
                        type="radio"
                        name="transportadora"
                        checked={selected === r.id}
                        disabled={!r.ok}
                        onChange={() => escolher(r)}
                        className="accent-brand-700"
                      />
                      <span className="min-w-[88px] font-medium text-slate-700">{r.label}</span>
                      {r.ok ? (
                        <>
                          <span className="font-semibold text-emerald-700">
                            {r.totalFrete != null ? brl(r.totalFrete) : "—"}
                          </span>
                          <span className="text-slate-500">· {r.prazo != null ? `${r.prazo} dia(s)` : "prazo —"}</span>
                          {isCheapest ? <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700">mais barato</span> : null}
                          {isFastest && !isCheapest ? <span className="rounded bg-sky-100 px-1.5 text-[10px] font-medium text-sky-700">mais rápido</span> : null}
                        </>
                      ) : (
                        <span className="text-xs text-amber-700">{r.error}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
          <hr className="border-slate-100" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Valor cotado (R$)</Label>
              <Input value={quotedValue} onChange={(e) => setQuotedValue(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label>Prazo cotado (dias)</Label>
              <Input value={quotedDays} onChange={(e) => setQuotedDays(e.target.value)} placeholder="5" />
            </div>
          </div>
          <Button variant="secondary" onClick={registerQuote}>
            {saved ? "Registrado no pedido! ✓" : "Registrar transportadora no pedido"}
          </Button>
          {savingErr ? <p className="text-xs text-amber-700">{savingErr}</p> : null}
          {tinyMsg ? (
            <p className={`text-xs ${tinyMsg.ok ? "text-emerald-700" : "text-amber-700"} break-all`}>{tinyMsg.text}</p>
          ) : null}
          {tinyDebug ? (
            <textarea
              readOnly
              value={tinyDebug}
              onFocus={(e) => e.currentTarget.select()}
              className="mt-1 h-40 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px] text-slate-700"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pacote de cotação</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={copy}>{copied ? "Copiado!" : "Copiar"}</Button>
            <Button size="sm" onClick={whatsapp}>WhatsApp</Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{text}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

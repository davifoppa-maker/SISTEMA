"use client";

import { useState } from "react";
import { Sparkles, Send, RotateCcw, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { CATALOG } from "@/lib/product-costs";

interface ParsedEndereco {
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}
interface ParsedCliente {
  nome: string;
  telefone: string | null;
  email: string | null;
  cpf: string | null;
  endereco: ParsedEndereco;
}
interface ParsedItem {
  sku: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
}
interface ParsedOrder {
  cliente: ParsedCliente;
  itens: ParsedItem[];
  observacao: string | null;
  confianca: "alta" | "media" | "baixa";
  avisos: string[];
}

interface SearchedCustomer {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Badge({ c }: { c: "alta" | "media" | "baixa" }) {
  const map = { alta: "bg-emerald-100 text-emerald-700", media: "bg-amber-100 text-amber-700", baixa: "bg-red-100 text-red-700" };
  const label = { alta: "Alta confiança", media: "Confiança média", baixa: "Baixa confiança" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[c]}`}>{label[c]}</span>;
}

export function LancarPedidoClient() {
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [editedItems, setEditedItems] = useState<ParsedItem[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [foundCustomers, setFoundCustomers] = useState<SearchedCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  async function handleParse() {
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setParsed(null);
    setCreated(false);
    setFoundCustomers([]);
    setSelectedCustomerId(null);
    try {
      const res = await fetch("/api/orders/ai-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`${json.error}${json.extra ? ` — ${json.extra}` : ""}`);
      const parsed = json.data ?? json;
      setParsed(parsed);
      setEditedItems(parsed.itens ?? []);

      // Buscar cliente existente no Tiny
      await searchCustomer(parsed.cliente.nome);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function searchCustomer(nome: string) {
    setSearchingCustomer(true);
    try {
      const res = await fetch("/api/orders/search-customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const json = await res.json();
      if (res.ok && json.data?.clientes?.length > 0) {
        setFoundCustomers(json.data.clientes);
      }
    } catch {
      // Ignora erro na busca, continua sem cliente existente
    } finally {
      setSearchingCustomer(false);
    }
  }

  function setItemQty(i: number, qty: number) {
    setEditedItems((prev) => prev.map((item, idx) => idx === i ? { ...item, quantidade: qty } : item));
  }
  function setItemPrice(i: number, price: number) {
    setEditedItems((prev) => prev.map((item, idx) => idx === i ? { ...item, valor_unitario: price } : item));
  }
  function removeItem(i: number) {
    setEditedItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = editedItems.reduce((s, it) => s + it.quantidade * it.valor_unitario, 0);

  // Calcular margem líquida
  const custoProdutos = editedItems.reduce((s, it) => {
    const produto = it.sku ? CATALOG.find((p) => p.sku === it.sku) : null;
    const custo = produto?.cost ?? 0;
    return s + custo * it.quantidade;
  }, 0);

  // Custos operacionais padrão (em %)
  const taxRate = (7 + 8 + 7) / 100; // impostos + comissao + logistica
  const custosOp = total * taxRate;
  const lucro = total - custoProdutos - custosOp;
  const margem = total > 0 ? (lucro / total) * 100 : 0;

  async function handleCreate() {
    if (!parsed) return;
    setCreating(true);
    try {
      const payload = { ...parsed, itens: editedItems, ...(selectedCustomerId ? { clienteId: selectedCustomerId } : {}) };
      const res = await fetch("/api/orders/create-tiny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao criar pedido");
      setCreated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar pedido");
    } finally {
      setCreating(false);
    }
  }

  function handleReset() {
    setTexto("");
    setParsed(null);
    setError(null);
    setCreated(false);
    setEditedItems([]);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-700" />
          Lançador de Pedido por IA
        </h1>
        <p className="text-sm text-slate-500">Descreva o pedido em linguagem natural — a IA interpreta e monta a estrutura para você confirmar.</p>
      </div>

      {!parsed && !created && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Descreva o pedido
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Exemplo:\nCliente: João Silva, (11) 98765-4321, joao@email.com\nEndereço: Rua das Flores, 123, Ap 45, Centro, São Paulo - SP, CEP 01310-100\nPedido:\n- 2x Whey Refill 900g Chocolate\n- 1x Creatina Refill 300g\nDesconto de 10%`}
            rows={8}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 outline-none focus:border-brand-700 focus:ring-1 focus:ring-brand-700 resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleParse}
              disabled={loading || !texto.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Interpretando..." : "Interpretar com IA"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {created && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <CheckCircle className="h-6 w-6 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-800">Pedido criado com sucesso no Tiny!</p>
            <p className="text-sm text-emerald-600">O pedido foi enviado para o Tiny ERP e já está disponível para processamento.</p>
          </div>
          <button onClick={handleReset} className="ml-auto rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
            Novo pedido
          </button>
        </div>
      )}

      {parsed && !created && (
        <div className="space-y-4">
          {/* Header with confidence */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">Pedido interpretado</span>
              <Badge c={parsed.confianca} />
            </div>
            <button onClick={handleReset} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <RotateCcw className="h-3.5 w-3.5" /> Recomeçar
            </button>
          </div>

          {parsed.avisos?.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 text-xs font-semibold text-amber-700 uppercase tracking-wide">Avisos da IA</p>
              <ul className="list-disc list-inside space-y-0.5">
                {parsed.avisos.map((a, i) => (
                  <li key={i} className="text-sm text-amber-700">{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Cliente existente */}
          {foundCustomers.length > 0 && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-sm font-semibold text-blue-900">Cliente já cadastrado no Tiny</p>
              <div className="space-y-2">
                {foundCustomers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}
                    className={`block w-full rounded-lg border-2 p-3 text-left transition-colors ${
                      selectedCustomerId === c.id
                        ? "border-blue-600 bg-blue-100"
                        : "border-blue-200 bg-white hover:border-blue-400"
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{c.nome}</div>
                    {c.cpf && <div className="text-xs text-slate-500">CPF: {c.cpf}</div>}
                    {c.email && <div className="text-xs text-slate-500">Email: {c.email}</div>}
                    {c.telefone && <div className="text-xs text-slate-500">Telefone: {c.telefone}</div>}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className={`block w-full rounded-lg border-2 p-3 text-left transition-colors ${
                    selectedCustomerId === null ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-700">Criar novo cliente</div>
                </button>
              </div>
            </div>
          )}

          {/* Cliente */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Dados do cliente</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-slate-400 block">Nome</span><span className="font-medium text-slate-800">{parsed.cliente.nome || "—"}</span></div>
              <div><span className="text-xs text-slate-400 block">Telefone</span><span className="font-medium text-slate-800">{parsed.cliente.telefone || "—"}</span></div>
              <div><span className="text-xs text-slate-400 block">E-mail</span><span className="font-medium text-slate-800">{parsed.cliente.email || "—"}</span></div>
              <div><span className="text-xs text-slate-400 block">CPF</span><span className="font-medium text-slate-800">{parsed.cliente.cpf || "—"}</span></div>
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
              <span className="text-xs text-slate-400 block mb-1">Endereço</span>
              <span className="text-slate-700">
                {[
                  parsed.cliente.endereco.logradouro,
                  parsed.cliente.endereco.complemento,
                  parsed.cliente.endereco.bairro,
                  parsed.cliente.endereco.cidade,
                  parsed.cliente.endereco.uf,
                  parsed.cliente.endereco.cep,
                ].filter(Boolean).join(", ") || "—"}
              </span>
            </div>
            {parsed.observacao && (
              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <span className="text-xs text-slate-400 block mb-1">Observação</span>
                <span className="text-slate-700">{parsed.observacao}</span>
              </div>
            )}
          </div>

          {/* Itens */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Itens do pedido</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide border-b border-slate-100">
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-center w-24">Qtd</th>
                  <th className="px-4 py-2 text-right w-32">Valor unit.</th>
                  <th className="px-4 py-2 text-right w-32">Total</th>
                  <th className="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editedItems.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{item.nome}</div>
                      {item.sku
                        ? <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                        : <div className="text-[10px] text-amber-500">SKU não mapeado</div>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number" min={1} value={item.quantidade}
                        onChange={(e) => setItemQty(i, Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 rounded border border-slate-200 px-1 py-0.5 text-center text-xs focus:border-brand-700 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number" min={0} step={0.01} value={item.valor_unitario}
                        onChange={(e) => setItemPrice(i, parseFloat(e.target.value) || 0)}
                        className="w-24 rounded border border-slate-200 px-1 py-0.5 text-right text-xs focus:border-brand-700 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {fmtBRL(item.quantidade * item.valor_unitario)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => removeItem(i)} className="text-slate-300 hover:text-red-500 text-base leading-none">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Total do pedido</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">{fmtBRL(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Margem líquida */}
          <div className={`rounded-xl border-2 p-6 text-center ${margem >= 26 ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Margem líquida</p>
            <p className={`text-5xl font-bold ${margem >= 26 ? "text-emerald-600" : "text-red-600"}`}>
              {margem.toFixed(1)}%
            </p>
          </div>

          {/* Confirm */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-xs text-slate-400">Revise os dados acima antes de confirmar. O pedido será criado diretamente no Tiny.</p>
              {creating && <p className="text-xs text-blue-600 mt-1">⏳ Enviando... (pode levar alguns segundos)</p>}
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || editedItems.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {creating ? "Criando..." : "Confirmar e criar no Tiny"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

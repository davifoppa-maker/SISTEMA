"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Pencil, Check, X } from "lucide-react";

interface CashAccount {
  id: string;
  company: string;
  name: string;
  current_balance: number | null;
  future_balance: number | null;
  sort_order: number;
  is_highlight?: boolean;
}

function fmtBRL(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isNegative(v: number | null) {
  return v != null && v < 0;
}

function CompanySection({
  company,
  accounts,
  onEdit,
}: {
  company: string;
  accounts: CashAccount[];
  onEdit: (a: CashAccount) => void;
}) {
  const totalCurrent = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const totalFuture = accounts.reduce((s, a) => s + (a.future_balance ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-800 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white">
        <div>{company}</div>
        <div className={`text-right ${isNegative(totalCurrent) ? "text-red-300" : "text-white"}`}>
          {fmtBRL(totalCurrent)}
        </div>
        <div className={`text-right ${isNegative(totalFuture) ? "text-red-300" : "text-emerald-300"}`}>
          {fmtBRL(totalFuture)}
        </div>
      </div>

      {/* Sub-header */}
      <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <div>Conta</div>
        <div className="text-right">Saldo atual</div>
        <div className="text-right">Saldo futuro</div>
      </div>

      {/* Rows */}
      {accounts.map((account) => (
        <div
          key={account.id}
          className={`group grid grid-cols-3 items-center border-b border-slate-50 px-4 py-2.5 text-sm last:border-0 hover:bg-slate-50 ${
            account.is_highlight ? "bg-blue-50/50" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={account.is_highlight ? "font-medium text-blue-700" : "text-slate-700"}>
              {account.name}
            </span>
            <button
              onClick={() => onEdit(account)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-brand-700"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <div className={`text-right font-medium ${isNegative(account.current_balance) ? "text-red-600" : "text-slate-800"}`}>
            {fmtBRL(account.current_balance)}
          </div>
          <div className={`text-right font-medium ${isNegative(account.future_balance) ? "text-red-600" : "text-slate-600"}`}>
            {fmtBRL(account.future_balance)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditModal({
  account,
  onClose,
  onSave,
}: {
  account: CashAccount;
  onClose: () => void;
  onSave: (id: string, current: number | null, future: number | null) => Promise<void>;
}) {
  const [current, setCurrent] = useState(account.current_balance?.toString() ?? "");
  const [future, setFuture] = useState(account.future_balance?.toString() ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await onSave(
      account.id,
      current === "" ? null : parseFloat(current.replace(",", ".")),
      future === "" ? null : parseFloat(future.replace(",", ".")),
    );
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-slate-800">{account.name}</h2>
        <p className="mb-4 text-xs text-slate-400">{account.company}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Saldo atual (R$)</label>
            <input
              type="number"
              step="0.01"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Saldo futuro (R$)</label>
            <input
              type="number"
              step="0.01"
              value={future}
              onChange={(e) => setFuture(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
              placeholder="0,00"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAccountModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: { company: string; name: string; current_balance: number | null; future_balance: number | null }) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const get = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
    await onSave({
      company: get("company"),
      name: get("name"),
      current_balance: get("current") === "" ? null : parseFloat(get("current")),
      future_balance: get("future") === "" ? null : parseFloat(get("future")),
    });
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Nova conta</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Empresa</label>
            <input name="company" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" placeholder="Ex: NRX, ECOPRO" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nome da conta</label>
            <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" placeholder="Ex: Itaú 99574-5" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Saldo atual (R$)</label>
            <input name="current" type="number" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Saldo futuro (R$)</label>
            <input name="future" type="number" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none" placeholder="0,00" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CaixaClient({ accounts }: { accounts: CashAccount[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CashAccount | null>(null);
  const [adding, setAdding] = useState(false);

  const companies = Array.from(new Set(accounts.map((a) => a.company)));
  const totalCurrent = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);
  const totalFuture = accounts.reduce((s, a) => s + (a.future_balance ?? 0), 0);

  async function handleSave(id: string, current: number | null, future: number | null) {
    await fetch("/api/financial/caixa", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, current_balance: current, future_balance: future }),
    });
    router.refresh();
  }

  async function handleAdd(data: { company: string; name: string; current_balance: number | null; future_balance: number | null }) {
    await fetch("/api/financial/caixa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Caixa</h1>
          <p className="text-sm text-slate-500">Posição de caixa por conta bancária</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          <PlusCircle className="h-4 w-4" />
          Nova conta
        </button>
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total atual</div>
          <div className={`mt-1 text-2xl font-bold ${isNegative(totalCurrent) ? "text-red-600" : "text-slate-800"}`}>
            {fmtBRL(totalCurrent)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Total futuro</div>
          <div className={`mt-1 text-2xl font-bold ${isNegative(totalFuture) ? "text-red-600" : "text-emerald-600"}`}>
            {fmtBRL(totalFuture)}
          </div>
        </div>
      </div>

      {/* Por empresa */}
      <div className="space-y-4">
        {companies.map((company) => (
          <CompanySection
            key={company}
            company={company}
            accounts={accounts.filter((a) => a.company === company)}
            onEdit={setEditing}
          />
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 p-12 text-center text-sm text-slate-400">
          Nenhuma conta cadastrada. Clique em "Nova conta" para começar.
        </div>
      )}

      {editing && (
        <EditModal account={editing} onClose={() => setEditing(null)} onSave={handleSave} />
      )}
      {adding && (
        <AddAccountModal onClose={() => setAdding(false)} onSave={handleAdd} />
      )}
    </div>
  );
}

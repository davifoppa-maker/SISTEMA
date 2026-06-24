import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";
import { FinancialSyncButton } from "./sync-button";
import { MonthFilter } from "./month-filter";

export const dynamic = "force-dynamic";

interface Receivable {
  id: string;
  tiny_id: string | null;
  customer: string;
  description: string | null;
  value: number;
  issue_date: string | null;
  due_date: string;
  received_at: string | null;
  category: string | null;
  notes: string | null;
}

function statusBadge(r: Receivable, today: string) {
  if (r.received_at) return { label: "Recebido", cls: "text-emerald-700 font-semibold" };
  if (r.due_date < today) return { label: "Vencido", cls: "text-red-600 font-semibold" };
  const diffDays = Math.floor(
    (new Date(r.due_date).getTime() - new Date(today).getTime()) / 86_400_000,
  );
  if (diffDays <= 7) return { label: "A vencer", cls: "text-amber-600 font-semibold" };
  return { label: "Em dia", cls: "text-slate-500" };
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: { mes?: string; q?: string };
}) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.mes ?? defaultMes;
  const q = (searchParams.q ?? "").toLowerCase();

  // Calcula o primeiro dia do mês seguinte para filtro preciso (evita datas inválidas como 2025-02-31).
  const [mesY, mesM] = mes.split("-").map(Number);
  const proximoMes = mesM === 12
    ? `${mesY + 1}-01-01`
    : `${mesY}-${String(mesM + 1).padStart(2, "0")}-01`;

  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("receivables")
    .select("*")
    .gte("due_date", `${mes}-01`)
    .lt("due_date", proximoMes)
    .order("due_date", { ascending: true });

  const all: Receivable[] = rows ?? [];
  const receivables = q
    ? all.filter(
        (r) =>
          r.customer.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q),
      )
    : all;

  const label = mesLabel(mes);

  // Summary cards
  const totalAReceber = receivables
    .filter((r) => !r.received_at)
    .reduce((s, r) => s + Number(r.value), 0);

  const vencidos = receivables.filter((r) => !r.received_at && r.due_date < today);
  const totalVencidos = vencidos.reduce((s, r) => s + Number(r.value), 0);

  const in7days = new Date(now);
  in7days.setDate(in7days.getDate() + 7);
  const in7str = in7days.toISOString().slice(0, 10);
  const aVencer = receivables.filter(
    (r) => !r.received_at && r.due_date >= today && r.due_date <= in7str,
  );
  const totalAVencer = aVencer.reduce((s, r) => s + Number(r.value), 0);

  const thisMes = today.slice(0, 7);
  const recebidosEsteMes = receivables.filter(
    (r) => r.received_at && r.received_at.slice(0, 7) === thisMes,
  );
  const totalRecebidosEsteMes = recebidosEsteMes.reduce((s, r) => s + Number(r.value), 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Financeiro" description="Contas a receber" />
        <FinancialSyncButton />
      </div>

      <MonthFilter value={mes} />

      {/* Busca por cliente */}
      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Buscar cliente ou descrição…"
          className="w-64 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-700 focus:outline-none"
        />
        <input type="hidden" name="mes" value={mes} />
        <button
          type="submit"
          className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Buscar
        </button>
      </form>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">A receber — {label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(totalAReceber)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Vencidos</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{brl(totalVencidos)}</div>
            <div className="text-xs text-slate-400">{vencidos.length} conta(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">A vencer (7 dias)</div>
            <div className="mt-1 text-2xl font-bold text-amber-600">{brl(totalAVencer)}</div>
            <div className="text-xs text-slate-400">{aVencer.length} conta(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Recebidos este mês</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{brl(totalRecebidosEsteMes)}</div>
            <div className="text-xs text-slate-400">{recebidosEsteMes.length} conta(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Contas a receber — {label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Descrição</Th>
                <Th>Valor</Th>
                <Th>Emissão</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message='Nenhuma conta encontrada. Clique em "Sincronizar do Tiny" para importar.' />
                  </td>
                </tr>
              ) : (
                receivables.map((r) => {
                  const { label: stLabel, cls: stCls } = statusBadge(r, today);
                  return (
                    <Tr key={r.id}>
                      <Td className="font-medium text-slate-800">{r.customer}</Td>
                      <Td className="max-w-xs truncate text-slate-500">{r.description ?? "—"}</Td>
                      <Td className="font-semibold">{brl(Number(r.value))}</Td>
                      <Td className="text-slate-500">{r.issue_date ? dateShort(r.issue_date) : "—"}</Td>
                      <Td className="text-slate-500">{dateShort(r.due_date)}</Td>
                      <Td className={stCls}>{stLabel}</Td>
                    </Tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

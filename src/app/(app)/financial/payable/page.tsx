import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";
import { PayableMonthFilter } from "./payable-month-filter";
import { NewPayableButton } from "./new-payable-button";

export const dynamic = "force-dynamic";

interface Payable {
  id: string;
  supplier: string;
  description: string | null;
  value: number;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  category: string | null;
  notes: string | null;
}

function statusBadge(p: Payable, today: string) {
  if (p.paid_at) return { label: "Pago", cls: "text-emerald-700 font-semibold" };
  if (p.due_date < today) return { label: "Vencido", cls: "text-red-600 font-semibold" };
  const diffDays = Math.floor(
    (new Date(p.due_date).getTime() - new Date(today).getTime()) / 86_400_000,
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

export default async function PayablePage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.mes ?? defaultMes;

  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("payables")
    .select("*")
    .gte("due_date", `${mes}-01`)
    .lte("due_date", `${mes}-31`)
    .order("due_date", { ascending: true });

  const payables: Payable[] = rows ?? [];

  // Summary cards
  const totalAPagar = payables
    .filter((p) => !p.paid_at)
    .reduce((s, p) => s + Number(p.value), 0);

  const vencidos = payables.filter((p) => !p.paid_at && p.due_date < today);
  const totalVencidos = vencidos.reduce((s, p) => s + Number(p.value), 0);

  const in7days = new Date(now);
  in7days.setDate(in7days.getDate() + 7);
  const in7str = in7days.toISOString().slice(0, 10);
  const aVencer = payables.filter(
    (p) => !p.paid_at && p.due_date >= today && p.due_date <= in7str,
  );
  const totalAVencer = aVencer.reduce((s, p) => s + Number(p.value), 0);

  const thisMes = today.slice(0, 7);
  const pagosEsteMes = payables.filter(
    (p) => p.paid_at && p.paid_at.slice(0, 7) === thisMes,
  );
  const totalPagosEsteMes = pagosEsteMes.reduce((s, p) => s + Number(p.value), 0);

  const label = mesLabel(mes);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Contas a pagar" description={label} />
        <NewPayableButton />
      </div>

      <PayableMonthFilter value={mes} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total a pagar</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(totalAPagar)}</div>
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
            <div className="text-xs text-slate-500">Pagos este mês</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{brl(totalPagosEsteMes)}</div>
            <div className="text-xs text-slate-400">{pagosEsteMes.length} conta(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contas a pagar — {label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Fornecedor</Th>
                <Th>Descrição</Th>
                <Th>Valor</Th>
                <Th>Emissão</Th>
                <Th>Vencimento</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </Tr>
            </Thead>
            <tbody>
              {payables.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="Nenhuma conta encontrada." />
                  </td>
                </tr>
              ) : (
                payables.map((p) => {
                  const { label: stLabel, cls: stCls } = statusBadge(p, today);
                  return (
                    <Tr key={p.id}>
                      <Td className="font-medium text-slate-800">{p.supplier}</Td>
                      <Td className="text-slate-500">{p.description ?? "—"}</Td>
                      <Td className="font-semibold">{brl(Number(p.value))}</Td>
                      <Td className="text-slate-500">{dateShort(p.issue_date)}</Td>
                      <Td className="text-slate-500">{dateShort(p.due_date)}</Td>
                      <Td className={stCls}>{stLabel}</Td>
                      <Td>
                        <span className="text-xs text-slate-400">—</span>
                      </Td>
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

import { loadStoreFor } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface Payable {
  id: string;
  supplier: string;
  value: number;
  due_date: string;
  paid_at: string | null;
}

function payableStatus(p: Payable, today: string) {
  if (p.due_date < today) return { label: "Vencido", cls: "text-red-600 font-semibold" };
  const diffDays = Math.floor(
    (new Date(p.due_date).getTime() - new Date(today).getTime()) / 86_400_000,
  );
  if (diffDays <= 7) return { label: "A vencer", cls: "text-amber-600 font-semibold" };
  return { label: "Em dia", cls: "text-slate-500" };
}

const CANCELLED = new Set(["cancelado"]);

export default async function FinancialDashboardPage() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Load orders + customers
  const store = await loadStoreFor(["orders", "customers"]);

  const activeOrders = store.orders.filter((o) => {
    if (CANCELLED.has((o.tiny_status ?? "").toLowerCase())) return false;
    const orderDate = (o.order_date ?? o.created_at).slice(0, 10);
    return orderDate.slice(0, 7) === mes;
  });

  const totalAReceber = activeOrders.reduce((s, o) => s + o.total_value, 0);

  // Top 5 customers by receivable value this month
  const byCustomer = new Map<string, { name: string; total: number }>();
  for (const order of activeOrders) {
    const customer = store.customers.find((c) => c.id === order.customer_id);
    const name = customer?.name ?? "Desconhecido";
    const existing = byCustomer.get(name);
    if (existing) {
      existing.total += order.total_value;
    } else {
      byCustomer.set(name, { name, total: order.total_value });
    }
  }
  const top5Clientes = Array.from(byCustomer.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Load payables
  const sb = getSupabaseAdmin();
  const { data: payableRows } = await sb
    .from("payables")
    .select("id, supplier, value, due_date, paid_at")
    .gte("due_date", `${mes}-01`)
    .lte("due_date", `${mes}-31`)
    .order("due_date", { ascending: true });

  const payables: Payable[] = payableRows ?? [];

  const unpaidPayables = payables.filter((p) => !p.paid_at);
  const totalAPagar = unpaidPayables.reduce((s, p) => s + Number(p.value), 0);
  const saldoPrevisto = totalAReceber - totalAPagar;

  // Boletos vencidos a pagar (overdue, not paid)
  const boletosVencidos = unpaidPayables.filter((p) => p.due_date < today);
  const totalBoletosVencidos = boletosVencidos.reduce((s, p) => s + Number(p.value), 0);

  // Next 10 upcoming payables (not paid, all months, ordered by due_date asc)
  const { data: upcomingRows } = await sb
    .from("payables")
    .select("id, supplier, value, due_date, paid_at")
    .is("paid_at", null)
    .order("due_date", { ascending: true })
    .limit(10);

  const proximosVencimentos: Payable[] = upcomingRows ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Dashboard Financeiro"
        description="Visão geral de contas a receber e a pagar"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total a receber (mês)</div>
            <div className="mt-1 text-2xl font-bold text-brand-700">{brl(totalAReceber)}</div>
            <div className="text-xs text-slate-400">{activeOrders.length} pedido(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total a pagar (mês)</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(totalAPagar)}</div>
            <div className="text-xs text-slate-400">{unpaidPayables.length} conta(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Saldo previsto</div>
            <div
              className={`mt-1 text-2xl font-bold ${saldoPrevisto >= 0 ? "text-emerald-700" : "text-red-600"}`}
            >
              {brl(saldoPrevisto)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Boletos vencidos a pagar</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{brl(totalBoletosVencidos)}</div>
            <div className="text-xs text-slate-400">{boletosVencidos.length} conta(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Two side-by-side sections */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top 5 clientes */}
        <Card>
          <CardHeader>
            <CardTitle>Top 5 clientes por valor a receber</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Cliente</Th>
                  <Th>Valor</Th>
                </Tr>
              </Thead>
              <tbody>
                {top5Clientes.length === 0 ? (
                  <tr>
                    <td colSpan={2}>
                      <EmptyState message="Nenhum cliente encontrado." />
                    </td>
                  </tr>
                ) : (
                  top5Clientes.map((c) => (
                    <Tr key={c.name}>
                      <Td className="font-medium text-slate-800">{c.name}</Td>
                      <Td className="font-semibold text-brand-700">{brl(c.total)}</Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* Próximos vencimentos */}
        <Card>
          <CardHeader>
            <CardTitle>Próximos vencimentos a pagar</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Fornecedor</Th>
                  <Th>Valor</Th>
                  <Th>Vencimento</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <tbody>
                {proximosVencimentos.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="Nenhum vencimento encontrado." />
                    </td>
                  </tr>
                ) : (
                  proximosVencimentos.map((p) => {
                    const { label: stLabel, cls: stCls } = payableStatus(p, today);
                    return (
                      <Tr key={p.id}>
                        <Td className="font-medium text-slate-800">{p.supplier}</Td>
                        <Td className="font-semibold">{brl(Number(p.value))}</Td>
                        <Td className="text-slate-500">{dateShort(p.due_date)}</Td>
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
    </div>
  );
}

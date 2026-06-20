import { loadStoreFor } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";
import type { Order, Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

const CANCELLED = new Set(["cancelado"]);

function agingLabel(days: number) {
  if (days <= 7) return { label: `${days}d`, cls: "text-emerald-700" };
  if (days <= 30) return { label: `${days}d`, cls: "text-amber-600" };
  return { label: `${days}d`, cls: "text-red-600 font-semibold" };
}

function dueDateLabel(due: string | null) {
  if (!due) return { label: "—", cls: "text-slate-400" };
  const days = Math.floor((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Vencido ${Math.abs(days)}d`, cls: "text-red-600 font-semibold" };
  if (days === 0) return { label: "Vence hoje", cls: "text-amber-600 font-semibold" };
  if (days <= 3) return { label: `${days}d`, cls: "text-amber-500" };
  return { label: `${days}d`, cls: "text-emerald-700" };
}

interface ReceivableRow {
  customer: Customer;
  orders: Order[];
  total: number;
  earliestDue: string | null;
}

function buildMonths(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
    months.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return months;
}

function getOrderMonth(order: Order): string {
  // Usa a data real do pedido no Tiny; fallback para created_at.
  const date = order.order_date ?? order.created_at;
  return date.slice(0, 7);
}

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const months = buildMonths();
  const mes = searchParams.mes ?? months[0].value;

  const store = await loadStoreFor(["orders", "customers"]);

  const activeOrders = store.orders.filter((o) => {
    if (CANCELLED.has((o.tiny_status ?? "").toLowerCase())) return false;
    return getOrderMonth(o) === mes;
  });

  // Agrupar por cliente
  const byCustomer = new Map<string, ReceivableRow>();
  for (const order of activeOrders) {
    const customer = store.customers.find((c) => c.id === order.customer_id);
    if (!customer) continue;
    const existing = byCustomer.get(customer.id);
    if (existing) {
      existing.orders.push(order);
      existing.total += order.total_value;
      // Menor vencimento entre os pedidos do cliente
      if (order.due_date) {
        if (!existing.earliestDue || order.due_date < existing.earliestDue) {
          existing.earliestDue = order.due_date;
        }
      }
    } else {
      byCustomer.set(customer.id, {
        customer,
        orders: [order],
        total: order.total_value,
        earliestDue: order.due_date ?? null,
      });
    }
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);

  const totalGeral = rows.reduce((s, r) => s + r.total, 0);
  const totalPedidos = activeOrders.length;
  const totalClientes = rows.length;
  const ticketMedio = totalPedidos > 0 ? totalGeral / totalPedidos : 0;

  const mesLabel = months.find((m) => m.value === mes)?.label ?? mes;

  // Boletos vencidos neste mês
  const vencidos = activeOrders.filter(
    (o) => o.due_date && o.due_date < new Date().toISOString().slice(0, 10),
  );
  const totalVencido = vencidos.reduce((s, o) => s + o.total_value, 0);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Financeiro" description="Visão geral de contas a receber." />

      {/* Filtro de mês */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Mês:</span>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => (
            <a
              key={m.value}
              href={`/financial?mes=${m.value}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                mes === m.value
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </a>
          ))}
        </div>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total — {mesLabel}</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(totalGeral)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Pedidos em aberto</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{totalPedidos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Boletos vencidos</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{brl(totalVencido)}</div>
            <div className="text-xs text-slate-400">{vencidos.length} pedido(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Ticket médio</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{brl(ticketMedio)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela por cliente */}
      <Card>
        <CardHeader>
          <CardTitle>Contas a receber por cliente — {mesLabel}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Documento</Th>
                <Th>Pedidos</Th>
                <Th>Valor total</Th>
                <Th>Vencimento</Th>
                <Th>Status boleto</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="Nenhum pedido em aberto neste mês." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { label: dueLabel, cls: dueCls } = dueDateLabel(row.earliestDue);
                  const aging = row.earliestDue
                    ? Math.floor((Date.now() - new Date(row.earliestDue).getTime()) / 86_400_000)
                    : 0;
                  const { label: ageLabel, cls: ageCls } = agingLabel(Math.max(0, aging));
                  return (
                    <Tr key={row.customer.id}>
                      <Td className="font-medium text-slate-800">{row.customer.name}</Td>
                      <Td className="text-slate-500">{row.customer.document ?? "—"}</Td>
                      <Td>{row.orders.length}</Td>
                      <Td className="font-semibold">{brl(row.total)}</Td>
                      <Td className="text-slate-500">
                        {row.earliestDue ? dateShort(row.earliestDue) : "—"}
                      </Td>
                      <Td className={dueCls}>{dueLabel}</Td>
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

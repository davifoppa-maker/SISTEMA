import { loadStoreFor } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";
import type { Order, Customer } from "@/lib/types";

export const dynamic = "force-dynamic";

const CANCELLED = new Set(["cancelado"]);

function aging(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function agingLabel(days: number) {
  if (days <= 7) return { label: `${days}d`, cls: "text-emerald-700" };
  if (days <= 30) return { label: `${days}d`, cls: "text-amber-600" };
  return { label: `${days}d`, cls: "text-red-600 font-semibold" };
}

interface ReceivableRow {
  customer: Customer;
  orders: Order[];
  total: number;
  oldestDate: string;
}

export default async function FinancialPage() {
  const store = await loadStoreFor(["orders", "customers"]);

  const activeOrders = store.orders.filter(
    (o) => !CANCELLED.has((o.tiny_status ?? "").toLowerCase()),
  );

  // Agrupar por cliente
  const byCustomer = new Map<string, ReceivableRow>();
  for (const order of activeOrders) {
    const customer = store.customers.find((c) => c.id === order.customer_id);
    if (!customer) continue;
    const existing = byCustomer.get(customer.id);
    if (existing) {
      existing.orders.push(order);
      existing.total += order.total_value;
      if (order.created_at < existing.oldestDate) existing.oldestDate = order.created_at;
    } else {
      byCustomer.set(customer.id, {
        customer,
        orders: [order],
        total: order.total_value,
        oldestDate: order.created_at,
      });
    }
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);

  const totalGeral = rows.reduce((s, r) => s + r.total, 0);
  const totalPedidos = activeOrders.length;
  const totalClientes = rows.length;
  const ticketMedio = totalPedidos > 0 ? totalGeral / totalPedidos : 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Financeiro" description="Visão geral de contas a receber." />

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total a receber</div>
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
            <div className="text-xs text-slate-500">Clientes</div>
            <div className="mt-1 text-2xl font-bold text-slate-800">{totalClientes}</div>
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
          <CardTitle>Contas a receber por cliente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Documento</Th>
                <Th>Pedidos</Th>
                <Th>Valor total</Th>
                <Th>Pedido mais antigo</Th>
                <Th>Idade</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="Nenhum pedido em aberto." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { label, cls } = agingLabel(aging(row.oldestDate));
                  return (
                    <Tr key={row.customer.id}>
                      <Td className="font-medium text-slate-800">{row.customer.name}</Td>
                      <Td className="text-slate-500">{row.customer.document ?? "—"}</Td>
                      <Td>{row.orders.length}</Td>
                      <Td className="font-semibold">{brl(row.total)}</Td>
                      <Td className="text-slate-500">{dateShort(row.oldestDate)}</Td>
                      <Td className={cls}>{label}</Td>
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

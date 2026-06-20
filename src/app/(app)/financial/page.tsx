import { Suspense } from "react";
import { loadStoreFor } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { brl, dateShort } from "@/lib/utils/format";
import type { Order, Customer } from "@/lib/types";
import { FinancialSyncButton } from "./sync-button";
import { MonthFilter } from "./month-filter";
import { FinancialFilters } from "./filters";

export const dynamic = "force-dynamic";

const CANCELLED = new Set(["cancelado"]);

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
  latestEmissao: string | null;
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getOrderDate(order: Order): string {
  return (order.order_date ?? order.created_at).slice(0, 10);
}

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: { mes?: string; q?: string; emissao_de?: string; emissao_ate?: string; venc_de?: string; venc_ate?: string };
}) {
  const now = new Date();
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = searchParams.mes ?? defaultMes;
  const q = (searchParams.q ?? "").toLowerCase();
  const emissaoDe = searchParams.emissao_de ?? "";
  const emissaoAte = searchParams.emissao_ate ?? "";
  const vencDe = searchParams.venc_de ?? "";
  const vencAte = searchParams.venc_ate ?? "";

  const store = await loadStoreFor(["orders", "customers"]);

  const activeOrders = store.orders.filter((o) => {
    if (CANCELLED.has((o.tiny_status ?? "").toLowerCase())) return false;
    const orderDate = getOrderDate(o);
    // Filtro por mês (emissão) — só aplica se não há filtro de datas específico
    if (!emissaoDe && !emissaoAte && !vencDe && !vencAte) {
      if (orderDate.slice(0, 7) !== mes) return false;
    }
    if (emissaoDe && orderDate < emissaoDe) return false;
    if (emissaoAte && orderDate > emissaoAte) return false;
    if (vencDe && (o.due_date ?? "") < vencDe) return false;
    if (vencAte && (o.due_date ?? "9999") > vencAte) return false;
    return true;
  });

  // Filtro de cliente por nome
  const filteredOrders = q
    ? activeOrders.filter((o) => {
        const c = store.customers.find((c) => c.id === o.customer_id);
        return c?.name.toLowerCase().includes(q) || c?.document?.includes(q);
      })
    : activeOrders;

  // Agrupar por cliente
  const byCustomer = new Map<string, ReceivableRow>();
  for (const order of filteredOrders) {
    const customer = store.customers.find((c) => c.id === order.customer_id);
    if (!customer) continue;
    const existing = byCustomer.get(customer.id);
    const orderDate = getOrderDate(order);
    if (existing) {
      existing.orders.push(order);
      existing.total += order.total_value;
      if (order.due_date && (!existing.earliestDue || order.due_date < existing.earliestDue))
        existing.earliestDue = order.due_date;
      if (!existing.latestEmissao || orderDate > existing.latestEmissao)
        existing.latestEmissao = orderDate;
    } else {
      byCustomer.set(customer.id, {
        customer,
        orders: [order],
        total: order.total_value,
        earliestDue: order.due_date ?? null,
        latestEmissao: orderDate,
      });
    }
  }

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
  const totalGeral = rows.reduce((s, r) => s + r.total, 0);
  const totalPedidos = filteredOrders.length;
  const totalClientes = rows.length;
  const ticketMedio = totalPedidos > 0 ? totalGeral / totalPedidos : 0;
  const vencidos = filteredOrders.filter(
    (o) => o.due_date && o.due_date < now.toISOString().slice(0, 10),
  );
  const totalVencido = vencidos.reduce((s, o) => s + o.total_value, 0);
  const label = mesLabel(mes);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Financeiro" description="Contas a receber" />
        <FinancialSyncButton />
      </div>

      <MonthFilter value={mes} />

      <Suspense>
        <FinancialFilters mes={mes} />
      </Suspense>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total — {label}</div>
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
          <CardTitle>Contas a receber por cliente — {label}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Cliente</Th>
                <Th>Documento</Th>
                <Th>Pedidos</Th>
                <Th>Valor total</Th>
                <Th>Emissão</Th>
                <Th>Vencimento</Th>
                <Th>Status boleto</Th>
              </Tr>
            </Thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="Nenhum pedido encontrado." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { label: dueLabel, cls: dueCls } = dueDateLabel(row.earliestDue);
                  return (
                    <Tr key={row.customer.id}>
                      <Td className="font-medium text-slate-800">{row.customer.name}</Td>
                      <Td className="text-slate-500">{row.customer.document ?? "—"}</Td>
                      <Td>{row.orders.length}</Td>
                      <Td className="font-semibold">{brl(row.total)}</Td>
                      <Td className="text-slate-500">
                        {row.latestEmissao ? dateShort(row.latestEmissao) : "—"}
                      </Td>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogisticBadge } from "@/components/status-badge";
import { readStore } from "@/lib/queries";
import { brl, dateShort } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const store = await readStore();
  const customer = store.customers.find((c) => c.id === params.id);
  if (!customer) notFound();

  const orders = store.orders.filter((o) => o.customer_id === customer.id);
  const orderIds = new Set(orders.map((o) => o.id));
  const occurrences = store.occurrences.filter((o) => o.order_id && orderIds.has(o.order_id));
  const tasks = store.customer_tasks.filter((t) => t.customer_id === customer.id);

  const carriersUsed = Array.from(
    new Set(
      store.shipments
        .filter((s) => orderIds.has(s.order_id) && s.carrier_id)
        .map((s) => store.carriers.find((c) => c.id === s.carrier_id)?.name)
        .filter(Boolean),
    ),
  );

  const deliveredDurations = store.shipments
    .filter((s) => orderIds.has(s.order_id) && s.real_collected_at && s.delivered_at)
    .map((s) => (new Date(s.delivered_at!).getTime() - new Date(s.real_collected_at!).getTime()) / 86400000);
  const avgDays = deliveredDurations.length
    ? (deliveredDurations.reduce((a, b) => a + b, 0) / deliveredDurations.length).toFixed(1)
    : "—";
  const ticket = orders.length ? customer.total_purchased / orders.length : 0;

  return (
    <>
      <PageHeader title={customer.name} description={customer.document ?? undefined}>
        <Link href="/customers" className="text-sm text-brand-700 hover:underline">← Voltar</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total comprado" value={brl(customer.total_purchased)} />
        <Stat label="Ticket médio" value={brl(ticket)} />
        <Stat label="Prazo médio real" value={avgDays === "—" ? "—" : `${avgDays} d`} />
        <Stat label="Pedidos" value={String(orders.length)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Últimos pedidos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead><tr><Th>Pedido</Th><Th className="text-right">Valor</Th><Th>Status</Th><Th>Data</Th></tr></Thead>
              <tbody>
                {orders.map((o) => (
                  <Tr key={o.id}>
                    <Td><Link href={`/orders/${o.id}`} className="text-brand-700 hover:underline">#{o.order_number}</Link></Td>
                    <Td className="text-right">{brl(o.total_value)}</Td>
                    <Td><LogisticBadge status={o.logistic_status} /></Td>
                    <Td className="text-slate-500">{dateShort(o.created_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {orders.length === 0 ? <EmptyState message="Sem pedidos." /> : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Logística</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-slate-500">Transportadoras usadas:</div>
              <div className="flex flex-wrap gap-1">
                {carriersUsed.length ? carriersUsed.map((c) => <Badge key={c} variant="info">{c}</Badge>) : <span className="text-slate-400">—</span>}
              </div>
              <div className="mt-2 text-slate-500">Problemas anteriores: {occurrences.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Tarefas pós-venda</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {tasks.length === 0 ? <span className="text-slate-400">Nenhuma tarefa.</span> : null}
              {tasks.map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-100 p-2">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-slate-500">{t.description}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xl font-semibold text-slate-800">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </CardContent>
    </Card>
  );
}

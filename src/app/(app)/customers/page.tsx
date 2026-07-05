import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { loadStoreFor } from "@/lib/db";
import { brl, dateShort } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const store = await loadStoreFor(["customers"]);
  const customers = [...store.customers].sort((a, b) => b.total_purchased - a.total_purchased);

  return (
    <>
      <PageHeader title="Clientes B2B" description="Visão comercial e logística para pós-venda e recompra." />
      <Card>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Tipo</Th>
                <Th>Documento</Th>
                <Th>Cidade/UF</Th>
                <Th className="text-right">Total comprado</Th>
                <Th>Último pedido</Th>
              </tr>
            </Thead>
            <tbody>
              {customers.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>
                  </Td>
                  <Td><Badge variant={c.customer_type === "b2b" ? "info" : "muted"}>{c.customer_type.toUpperCase()}</Badge></Td>
                  <Td className="text-slate-500">{c.document ?? "—"}</Td>
                  <Td className="text-slate-500">{c.city ? `${c.city}/${c.state}` : "—"}</Td>
                  <Td className="text-right">{brl(c.total_purchased)}</Td>
                  <Td className="text-slate-500">{dateShort(c.last_order_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {customers.length === 0 ? <EmptyState message="Nenhum cliente." /> : null}
        </CardContent>
      </Card>
    </>
  );
}

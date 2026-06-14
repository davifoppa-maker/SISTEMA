import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { loadStoreFor } from "@/lib/db";
import { dateTime } from "@/lib/utils/format";
import { SendForm } from "./send-form";
import { WhatsAppConnection } from "./whatsapp-connection";
import { ApprovalQueue } from "./approval-queue";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function WhatsAppPage() {
  const store = await loadStoreFor(["message_logs", "message_templates", "orders", "customers"]);

  const queued = store.message_logs
    .filter((m) => m.status === "queued" && m.direction === "outbound")
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1))
    .map((m) => {
      const order = m.order_id ? store.orders.find((o) => o.id === m.order_id) : null;
      // Resolve o cliente pela mensagem OU pelo pedido (cobre mensagens antigas
      // sem customer_id). O telefone da fila usa o snapshot da mensagem e, se
      // vazio, cai pro telefone atual do cadastro do cliente (mesma fonte do
      // detalhe do pedido) — antes vinha em branco quando capturado cedo demais.
      const customer =
        (m.customer_id ? store.customers.find((c) => c.id === m.customer_id) : null) ??
        (order?.customer_id ? store.customers.find((c) => c.id === order.customer_id) : null);
      return {
        id: m.id,
        content: m.content,
        phone: m.phone || customer?.whatsapp_phone || customer?.phone || null,
        order_number: order?.order_number ?? null,
        customer_name: customer?.name ?? null,
      };
    });

  const logs = [...store.message_logs]
    .filter((m) => m.status !== "queued")
    .sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? 1 : -1));

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Conexão, fila de aprovação, templates e envio manual."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Conexão do WhatsApp</CardTitle></CardHeader>
          <CardContent><WhatsAppConnection /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fila de aprovação ({queued.length})</CardTitle></CardHeader>
          <CardContent><ApprovalQueue items={queued} /></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Envio manual</CardTitle></CardHeader>
          <CardContent><SendForm /></CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Templates (editáveis)</CardTitle></CardHeader>
          <CardContent><TemplateEditor templates={store.message_templates} /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Logs de mensagens</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <Thead>
              <tr>
                <Th>Data</Th>
                <Th>Direção</Th>
                <Th>Telefone</Th>
                <Th>Gatilho</Th>
                <Th>Conteúdo</Th>
                <Th>Status</Th>
              </tr>
            </Thead>
            <tbody>
              {logs.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-500">{dateTime(m.sent_at ?? m.created_at)}</Td>
                  <Td><Badge variant={m.direction === "outbound" ? "info" : "muted"}>{m.direction}</Badge></Td>
                  <Td className="text-xs">{m.phone}</Td>
                  <Td className="text-xs text-slate-500">{m.trigger_key ?? "manual"}</Td>
                  <Td className="max-w-[320px] truncate text-xs">{m.content}</Td>
                  <Td><Badge variant={m.status === "sent" || m.status === "delivered" || m.status === "read" ? "success" : m.status === "failed" ? "danger" : "muted"}>{m.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {logs.length === 0 ? <EmptyState message="Nenhuma mensagem registrada." /> : null}
        </CardContent>
      </Card>
    </>
  );
}

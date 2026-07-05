import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogisticBadge, SlaBadge } from "@/components/status-badge";
import { readStore } from "@/lib/queries";
import { dataDriver, loadStore, commitStore } from "@/lib/db";
import { fetchOrderRawPayload } from "@/lib/db/supabase-data";
import { brl, dateTime } from "@/lib/utils/format";
import { CHANNEL_LABELS } from "@/lib/types";
import { getProvider, providerIdForCarrierName } from "@/lib/services/freight/registry";
import { fetchOrderById, isTinyConnected } from "@/lib/services/tiny-api";
import { uuid, nowIso } from "@/lib/utils/ids";
import { SendNfButton } from "./send-nf-button";
import { StatusControl } from "./status-control";
import { TrackButton } from "./track-button";

export const dynamic = "force-dynamic";

// Rótulos amigáveis para os tipos de SLA (a UI não mostra o nome técnico).
const SLA_TYPE_LABELS: Record<string, string> = {
  aprovacao_faturamento: "Aprovação → faturamento",
  faturamento_separacao: "Faturamento → separação",
  separacao_coleta: "Separação → coleta",
  coleta_entrega: "Prazo de entrega",
  ciclo_total: "Ciclo total",
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const store = await readStore();
  const order = store.orders.find((o) => o.id === params.id);
  if (!order) notFound();

  // O JSON bruto é omitido das leituras em massa; busca sob demanda aqui.
  const rawPayload = dataDriver === "supabase" ? await fetchOrderRawPayload(order.id) : order.raw_payload;

  const customer = store.customers.find((c) => c.id === order.customer_id);

  // Tenta itens do store; se vazio, busca direto do Tiny agora (server-side).
  // Tenta a conta (empresa) do pedido e, se não achar, a outra conta — assim
  // funciona mesmo que a marcação de empresa esteja errada. Corrige a empresa
  // do pedido para a conta que efetivamente respondeu.
  const empresa = (order as any).empresa ?? "nyer";
  let storeItems = store.order_items.filter((i) => i.order_id === order.id);
  if (storeItems.length === 0 && order.tiny_id) {
    try {
      const ordem = empresa === "ecopro" ? ["ecopro", "nyer"] : ["nyer", "ecopro"];
      let itensTiny: Array<Record<string, unknown>> = [];
      let empresaOk = empresa;
      for (const emp of ordem) {
        if (!(await isTinyConnected(emp).catch(() => false))) continue;
        const full = await fetchOrderById(order.tiny_id, emp).catch(() => null);
        const its = (full as Record<string, unknown>)?.itens as Array<Record<string, unknown>> ?? [];
        if (its.length > 0) { itensTiny = its; empresaOk = emp; break; }
      }
      {
        if (itensTiny.length > 0) {
          const mutableStore = await loadStore();
          const mutableOrder = mutableStore.orders.find((o) => o.id === order.id);
          if (mutableOrder) {
            // Corrige a empresa se a conta que respondeu for outra.
            if (((mutableOrder as any).empresa ?? "nyer") !== empresaOk) {
              (mutableOrder as any).empresa = empresaOk;
            }
            // Substitui itens do pedido com IDs determinísticos (sem duplicar).
            mutableStore.order_items = mutableStore.order_items.filter((i) => i.order_id !== order.id);
            storeItems = [];
            itensTiny.forEach((it, idx) => {
              const item = {
                id: `${order.id}:item:${idx}`,
                order_id: order.id,
                sku: String(it.codigo ?? "").trim() || null,
                description: String(it.descricao ?? "").trim() || "Item",
                quantity: parseFloat(String(it.quantidade ?? "0")) || 0,
                unit_value: parseFloat(String(it.valor_unitario ?? "0")) || 0,
              };
              mutableStore.order_items.push(item);
              storeItems = [...storeItems, item];
            });
            mutableOrder.updated_at = nowIso();
            await commitStore(mutableStore);
          }
        }
      }
    } catch {
      // falhou — segue sem itens
    }
  }

  type PayloadItem = { id?: string | number; codigo?: string; descricao?: string; quantidade?: number; valor_unitario?: number; valor_desconto?: number; valor?: number };
  const payloadItems = ((rawPayload as Record<string, unknown>)?.itens ?? []) as PayloadItem[];
  const items = storeItems.length > 0 ? storeItems :
    payloadItems.length > 0 ? payloadItems.map((pi, idx) => ({
      id: `payload-${idx}`,
      order_id: order.id,
      sku: pi.codigo || "—",
      description: pi.descricao || "—",
      quantity: pi.quantidade || 1,
      unit_value: pi.valor_unitario || 0,
    })) : [];
  const invoice = store.invoices.find((i) => i.order_id === order.id);
  const shipment = store.shipments.find((s) => s.order_id === order.id);
  const carrier = shipment?.carrier_id ? store.carriers.find((c) => c.id === shipment.carrier_id) : null;
  const volumes = shipment ? store.shipment_volumes.filter((v) => v.shipment_id === shipment.id) : [];
  const slas = shipment ? store.sla_records.filter((s) => s.shipment_id === shipment.id) : [];
  const messages = store.message_logs.filter((m) => m.order_id === order.id);
  const occurrences = store.occurrences.filter((o) => o.order_id === order.id);
  // Transportadora de rastreio resolvida pelo nome (o botão "Rastrear" usa esta).
  const trackProviderId = providerIdForCarrierName(carrier?.name ?? order.carrier_name);
  const trackProviderLabel = trackProviderId ? getProvider(trackProviderId)?.label ?? null : null;

  return (
    <>
      <PageHeader title={`Pedido #${order.order_number}`} description={order.external_order_number ?? undefined}>
        <Link href="/orders" className="text-sm text-brand-700 hover:underline">← Voltar</Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pedido</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Canal"><Badge variant="info">{order.order_origin ?? CHANNEL_LABELS[order.channel]}</Badge></Row>
            <Row label="Status Tiny">{order.tiny_status ?? "—"}</Row>
            <Row label="Status logístico"><LogisticBadge status={order.logistic_status} /></Row>
            <Row label="Valor">{brl(order.total_value)}</Row>
            <Row label="Frete">{order.freight_value != null ? brl(order.freight_value) : "—"}</Row>
            <Row label="Prazo (entrega)">{order.expected_delivery_at ? dateTime(order.expected_delivery_at) : "—"}</Row>
            <Row label="Nat. operação">{(order as any).nat_operacao ?? "—"}</Row>
            <Row label="Origem">{order.order_origin ?? "—"}</Row>
            <Row label="Vendedor">{order.seller ?? "—"}</Row>
            <Row label="Lista de preço">{order.price_list ?? "—"}</Row>
            <StatusControl orderId={order.id} current={order.logistic_status} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Nome">{customer?.name ?? "—"}</Row>
            <Row label="Documento">{customer?.document ?? "—"}</Row>
            <Row label="WhatsApp">{customer?.whatsapp_phone ?? "—"}</Row>
            <Row label="Cidade/UF">{order.city ? `${order.city}/${order.state}` : "—"}</Row>
            <Row label="Endereço">{customer?.address ?? "—"}</Row>
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="text-xs text-brand-700 hover:underline">Ver histórico do cliente →</Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nota fiscal & expedição</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="NF">{invoice ? `${invoice.number}${invoice.series ? `/${invoice.series}` : ""}` : "—"}</Row>
            <Row label="Chave NFe" mono>{invoice?.access_key ?? "—"}</Row>
            <Row label="Transportadora">{carrier?.name ?? order.carrier_name ?? "—"}</Row>
            <Row label="Rastreio">{shipment?.tracking_code ?? "—"}</Row>
            <Row label="Coleta real">{dateTime(shipment?.real_collected_at)}</Row>
            <Row label="Previsão entrega">{dateTime(shipment?.estimated_delivery_at)}</Row>
            {shipment && shipment.status === "aguardando_coleta" ? (
              <Link href="/checkout" className="text-xs text-brand-700 hover:underline">Ir para checkout de expedição →</Link>
            ) : null}
            <SendNfButton orderId={order.id} />
            <Link
              href={`/orders/${order.id}/cotacao`}
              className="mt-2 inline-block rounded-lg border border-brand-700 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              Cotar frete
            </Link>
            <TrackButton
              providerId={trackProviderId}
              providerLabel={trackProviderLabel}
              nf={invoice?.number ?? order.nf_numero}
              chave={invoice?.access_key ?? order.nf_chave}
              trackingCode={shipment?.tracking_code ?? null}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Card>
          <CardHeader><CardTitle>Itens</CardTitle></CardHeader>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Itens não disponíveis — o Tiny não retornou itens para este pedido.
              </div>
            ) : (
              <Table>
                <Thead><tr><Th>SKU</Th><Th>Descrição</Th><Th className="text-right">Qtd</Th><Th className="text-right">Valor Unit.</Th><Th className="text-right">Desconto</Th><Th className="text-right">Total</Th></tr></Thead>
                <tbody>
                  {items.map((i) => {
                    const discount = (payloadItems.find((pi) => pi.codigo === i.sku)?.valor_desconto) || 0;
                    const total = (i.quantity * i.unit_value) - (discount || 0);
                    return (
                      <Tr key={i.id}>
                        <Td>{i.sku}</Td>
                        <Td>{i.description}</Td>
                        <Td className="text-right">{i.quantity}</Td>
                        <Td className="text-right">{brl(i.unit_value)}</Td>
                        <Td className="text-right text-red-600">{discount ? brl(discount) : "—"}</Td>
                        <Td className="text-right font-medium">{brl(total)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Volumes ({volumes.filter((v) => v.scanned).length}/{volumes.length} bipados)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead><tr><Th>#</Th><Th>Código</Th><Th>Peso</Th><Th>Bipado</Th></tr></Thead>
              <tbody>
                {volumes.map((v) => (
                  <Tr key={v.id}>
                    <Td>{v.volume_number}</Td>
                    <Td className="font-mono text-xs">{v.barcode}</Td>
                    <Td>{v.weight ? `${v.weight} kg` : "—"}</Td>
                    <Td>{v.scanned ? <Badge variant="success">Sim</Badge> : <Badge variant="muted">Não</Badge>}</Td>
                  </Tr>
                ))}
                {volumes.length === 0 ? <Tr><Td colSpan={4} className="text-slate-400">Sem volumes (NF não emitida).</Td></Tr> : null}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Forma de pagamento</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(() => {
              const formas = ((rawPayload as Record<string, unknown>)?.formasPagamento ?? []) as Array<{ tipo?: string; parcelas?: number; vencimento?: string }>;
              if (formas.length === 0) return <span className="text-slate-400">Informação não disponível.</span>;
              return formas.map((f, idx) => (
                <div key={idx}>
                  <div className="font-medium text-slate-700">{f.tipo ?? "—"}</div>
                  {f.parcelas ? <div className="text-xs text-slate-500">{f.parcelas}x</div> : null}
                  {f.vencimento ? <div className="text-xs text-slate-500">Vencimento: {f.vencimento}</div> : null}
                </div>
              ));
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Resumo financeiro</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(() => {
              const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unit_value), 0);
              const totalDiscount = payloadItems.reduce((sum, pi) => sum + ((pi.valor_desconto ?? 0) || 0), 0);
              const freight = order.freight_value ?? 0;
              const total = order.total_value ?? 0;
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-medium">{brl(subtotal)}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Desconto</span>
                      <span className="font-medium">-{brl(totalDiscount)}</span>
                    </div>
                  )}
                  {freight > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Frete</span>
                      <span className="font-medium">{brl(freight)}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
                    <span>Total</span>
                    <span className={total < 0 ? "text-red-600" : "text-slate-800"}>{brl(total)}</span>
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>SLA</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {slas.length === 0 ? <span className="text-slate-400">Sem SLA (aguardando coleta real).</span> : null}
            {slas.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span className="text-slate-600">
                  {SLA_TYPE_LABELS[s.sla_type] ?? s.sla_type}
                  {s.deadline_at ? <span className="text-slate-400"> · até {dateTime(s.deadline_at)}</span> : null}
                </span>
                <SlaBadge status={s.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mensagens WhatsApp</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {messages.length === 0 ? <span className="text-slate-400">Nenhuma mensagem.</span> : null}
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-slate-100 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <Badge variant={m.status === "sent" ? "success" : m.status === "failed" ? "danger" : "muted"}>{m.status}</Badge>
                  <span className="text-[10px] text-slate-400">{dateTime(m.sent_at ?? m.created_at)}</span>
                </div>
                <p className="text-xs text-slate-600">{m.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ocorrências</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {occurrences.length === 0 ? <span className="text-slate-400">Sem ocorrências.</span> : null}
            {occurrences.map((o) => (
              <div key={o.id} className="rounded-lg border border-slate-100 p-2">
                <div className="flex items-center justify-between">
                  <Badge variant="danger">{o.type}</Badge>
                  <span className="text-[10px] text-slate-400">{o.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{o.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Payload bruto (Tiny)</CardTitle></CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100">
            {JSON.stringify(rawPayload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={mono ? "text-right font-mono text-xs" : "text-right font-medium"}>{children}</span>
    </div>
  );
}

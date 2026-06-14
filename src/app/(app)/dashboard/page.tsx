import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Thead, Th, Tr, Td, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { loadStoreFor } from "@/lib/db";
import { refreshSlaStatuses } from "@/lib/services/sla";
import { carrierRanking, computeMetrics, isTodayBr, orderMatchesAudience, B2B_PROCESSING_STATUSES, type Audience } from "@/lib/services/dashboard";
import { isPickupCarrier } from "@/lib/services/tiny";
import { brl } from "@/lib/utils/format";
import { DollarSign } from "lucide-react";
import { MetricsGrid } from "./metrics-grid";
import { AudienceFilter } from "./audience-filter";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { audience?: string } }) {
  // Público do dashboard (canto superior direito). Padrão B2B (Mercos).
  const audience: Audience = searchParams.audience === "b2c" ? "b2c" : "b2b";
  const store = await loadStoreFor(["orders", "customers", "shipments", "shipping_batches", "sla_records", "alerts", "carriers", "occurrences"]);
  refreshSlaStatuses(store);
  const m = computeMetrics(store, audience);
  const ranking = carrierRanking(store, audience);
  // Pedidos do público escolhido (recorta as listas/alertas dos cards).
  const audOrderIds = new Set(store.orders.filter((o) => orderMatchesAudience(o.channel, audience)).map((o) => o.id));
  const inAud = (orderId: string | null) => orderId != null && audOrderIds.has(orderId);
  // Retiradas no CD não geram atraso — não exibe alertas dessas expedições.
  const pickupShipmentIds = new Set(
    store.shipments
      .filter((s) => {
        const c = store.carriers.find((cr) => cr.id === s.carrier_id);
        return isPickupCarrier(c?.name);
      })
      .map((s) => s.id),
  );
  const openAlerts = store.alerts
    .filter((a) => !a.resolved && a.type !== "entrega_confirmada" && inAud(a.order_id) && !(a.shipment_id && pickupShipmentIds.has(a.shipment_id)))
    .slice(0, 8);

  // Listas por card (mesmos critérios das métricas) — exibidas ao clicar.
  type Item = { id: string; number: string; customer: string | null; detail: string | null };
  type OrderT = (typeof store.orders)[number];
  const carrierNameOf = (carrierId: string | null, fallback: string | null = null): string | null =>
    (carrierId ? store.carriers.find((c) => c.id === carrierId)?.name : null) ?? fallback;
  const orderOf = (orderId: string) => store.orders.find((o) => o.id === orderId);
  const shipmentOf = (orderId: string) => store.shipments.find((s) => s.order_id === orderId);
  const custName = (o: OrderT | undefined | null): string | null =>
    (o ? store.customers.find((c) => c.id === o.customer_id)?.name : null) ?? null;
  const mk = (o: OrderT, detail: string | null): Item => ({ id: o.id, number: o.order_number, customer: custName(o), detail });
  const todayBatchIds = new Set(store.shipping_batches.filter((b) => isTodayBr(b.collected_at)).map((b) => b.id));
  const isPickupShip = (s: { id: string }) => pickupShipmentIds.has(s.id);
  const notNull = (x: Item | null): x is Item => x !== null;

  const lists: Record<string, Item[]> = {
    b2b: store.orders
      .filter((o) => inAud(o.id) && B2B_PROCESSING_STATUSES.has(o.logistic_status))
      .map((o) => mk(o, o.tiny_status ?? o.logistic_status)),
    awaitingCollection: store.shipments
      .filter((s) => s.status === "aguardando_coleta" && inAud(s.order_id))
      .map((s) => {
        const o = orderOf(s.order_id);
        return o ? mk(o, carrierNameOf(s.carrier_id, o.carrier_name)) : null;
      })
      .filter(notNull),
    collectedToday: store.shipments
      .filter((s) => s.batch_id != null && todayBatchIds.has(s.batch_id) && !isPickupShip(s) && inAud(s.order_id))
      .map((s) => {
        const o = orderOf(s.order_id);
        return o ? mk(o, carrierNameOf(s.carrier_id)) : null;
      })
      .filter(notNull),
    inTransit: store.orders
      .filter((o) => inAud(o.id) && (o.logistic_status === "em_transito" || o.logistic_status === "coletado"))
      .map((o) => mk(o, carrierNameOf(shipmentOf(o.id)?.carrier_id ?? null, o.carrier_name))),
    semRastreio: store.alerts
      .filter((a) => a.type === "sem_rastreio" && !a.resolved && inAud(a.order_id))
      .map((a) => {
        const o = a.order_id ? orderOf(a.order_id) : null;
        const sh = a.shipment_id ? store.shipments.find((s) => s.id === a.shipment_id) : null;
        return o ? mk(o, carrierNameOf(sh?.carrier_id ?? null, o.carrier_name)) : null;
      })
      .filter(notNull),
    atRisk: store.sla_records
      .filter((r) => r.status === "em_risco" && inAud(r.order_id))
      .map((r) => {
        const o = orderOf(r.order_id);
        return o ? mk(o, carrierNameOf(shipmentOf(o.id)?.carrier_id ?? null, o.carrier_name)) : null;
      })
      .filter(notNull),
    delayed: store.orders
      .filter((o) => inAud(o.id) && o.logistic_status === "atrasado" && !(shipmentOf(o.id) && isPickupShip(shipmentOf(o.id)!)))
      .map((o) => mk(o, carrierNameOf(shipmentOf(o.id)?.carrier_id ?? null, o.carrier_name))),
    deliveredToday: store.shipments
      .filter((s) => isTodayBr(s.delivered_at) && inAud(s.order_id))
      .map((s) => {
        const o = orderOf(s.order_id);
        return o ? mk(o, carrierNameOf(s.carrier_id, o.carrier_name)) : null;
      })
      .filter(notNull),
  };

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Dashboard operacional"
          description="O que precisa de ação hoje — exceções, prazos e valor em trânsito."
        />
        <div className="pt-1">
          <AudienceFilter current={audience} />
        </div>
      </div>

      <MetricsGrid m={m} lists={lists} audience={audience} />

      <div className="mt-4">
        <Card>
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <div className="text-2xl font-semibold text-slate-800">{brl(m.valueInTransit)}</div>
              <div className="text-xs text-slate-500">Valor em trânsito (risco financeiro logístico)</div>
            </div>
            <DollarSign className="h-7 w-7 text-emerald-600" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ranking por transportadora</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <Thead>
                <tr>
                  <Th>Transportadora</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">No prazo</Th>
                  <Th className="text-right">Atrasados</Th>
                  <Th className="text-right">Prazo médio (d)</Th>
                  <Th className="text-right">Ocorrências</Th>
                  <Th className="text-right">Valor em trânsito</Th>
                </tr>
              </Thead>
              <tbody>
                {ranking.map((r) => (
                  <Tr key={r.carrierId}>
                    <Td className="font-medium text-slate-700">{r.name}</Td>
                    <Td className="text-right">{r.orders}</Td>
                    <Td className="text-right text-emerald-600">{r.onTime}</Td>
                    <Td className="text-right text-red-600">{r.delayed}</Td>
                    <Td className="text-right">{r.avgDays}</Td>
                    <Td className="text-right">{r.occurrences}</Td>
                    <Td className="text-right">{brl(r.valueInTransit)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {ranking.length === 0 ? <EmptyState message="Sem expedições registradas." /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas internos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openAlerts.length === 0 ? (
              <EmptyState message="Nenhum alerta aberto." />
            ) : (
              openAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2">
                  <Badge
                    variant={a.type === "atrasado" ? "danger" : a.type === "em_risco" ? "warning" : "info"}
                  >
                    {a.type}
                  </Badge>
                  <span className="text-xs text-slate-600">{a.message}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

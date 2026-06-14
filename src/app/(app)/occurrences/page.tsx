import { PageHeader } from "@/components/page-header";
import { loadStoreFor } from "@/lib/db";
import { refreshSlaStatuses } from "@/lib/services/sla";
import { OccurrencesBoard, type OccItem } from "./occurrences-board";

export const dynamic = "force-dynamic";

export default async function OccurrencesPage() {
  const store = await loadStoreFor(["occurrences", "orders", "carriers", "shipments", "sla_records"]);
  refreshSlaStatuses(store);

  const items: OccItem[] = store.occurrences
    .map((o) => {
      const order = store.orders.find((x) => x.id === o.order_id);
      const carrier = store.carriers.find((c) => c.id === o.carrier_id);
      return {
        id: o.id,
        type: o.type,
        severity: o.severity,
        status: o.status,
        description: o.description ?? "",
        opened_at: o.opened_at,
        order_id: order?.id ?? null,
        order_number: order?.order_number ?? null,
        carrier_name: carrier?.name ?? null,
      };
    })
    .sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));

  return (
    <>
      <PageHeader
        title="Ocorrências"
        description="Quadro Kanban — arraste os cards entre Aberta, Em andamento e Resolvida. Atraso gera alerta interno primeiro (não notifica o cliente automaticamente)."
      />
      <OccurrencesBoard items={items} />
    </>
  );
}

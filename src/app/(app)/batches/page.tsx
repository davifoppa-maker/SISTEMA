import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { readStore } from "@/lib/queries";
import { dataDriver } from "@/lib/db";
import { fetchCollectionHistory, type CollectionRow } from "@/lib/db/supabase-data";
import { BatchesClient } from "./batches-client";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  let rows: CollectionRow[];

  if (dataDriver === "supabase") {
    rows = await fetchCollectionHistory();
  } else {
    // modo memória (dev/simulação): monta a partir do store.
    const store = await readStore();
    rows = [...store.shipping_batches]
      .sort((a, b) => ((a.collected_at ?? "") < (b.collected_at ?? "") ? 1 : -1))
      .map((b) => {
        const shipments = store.shipments.filter((s) => s.batch_id === b.id);
        return {
          id: b.id,
          collected_at: b.collected_at,
          carrier_name: store.carriers.find((c) => c.id === b.carrier_id)?.name ?? null,
          collector_name: b.collector_name,
          orders: shipments
            .map((s) => {
              const o = store.orders.find((or) => or.id === s.order_id);
              return o ? { id: o.id, number: String(o.order_number) } : null;
            })
            .filter(Boolean) as { id: string; number: string }[],
          volumes: shipments.reduce(
            (sum, s) => sum + store.shipment_volumes.filter((v) => v.shipment_id === s.id).length,
            0,
          ),
        };
      });
  }

  return (
    <>
      <PageHeader title="Lotes de coleta" description="Coletas agrupadas por dia e transportadora. Clique para ver os pedidos." />
      <Card>
        <CardContent className="p-0">
          <BatchesClient rows={rows} />
        </CardContent>
      </Card>
    </>
  );
}

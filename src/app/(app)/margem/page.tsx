import { PageHeader } from "@/components/page-header";
import { readStore } from "@/lib/queries";
import { MargemClient } from "./margem-client";

export const dynamic = "force-dynamic";

export default async function MargemPage() {
  const store = await readStore();

  const orders = store.orders
    .filter((o) => o.channel === "b2b_mercos")
    .sort((a, b) => {
      const na = Number(a.order_number);
      const nb = Number(b.order_number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return a.order_number < b.order_number ? 1 : -1;
    })
    .map((o) => {
      const customer = store.customers.find((c) => c.id === o.customer_id);
      const items = store.order_items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({
          id: i.id,
          sku: i.sku ?? "—",
          description: i.description,
          quantity: i.quantity,
          unit_value: i.unit_value,
        }));
      return {
        id: o.id,
        order_number: o.order_number,
        customer_name: customer?.name ?? "—",
        total_value: o.total_value,
        freight_value: o.freight_value ?? 0,
        items,
      };
    });

  return (
    <>
      <PageHeader
        title="Gestor de Margem"
        description="Calcule a margem de contribuição de cada pedido considerando impostos, comissão e logística."
      />
      <MargemClient orders={orders} />
    </>
  );
}

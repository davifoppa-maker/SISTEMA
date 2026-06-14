import { PageHeader } from "@/components/page-header";
import { loadStoreFor } from "@/lib/db";
import { CheckoutClient } from "./checkout-client";
import { RefreshTinyButton } from "@/components/refresh-tiny-button";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const store = await loadStoreFor(["carriers"]);
  const carriers = store.carriers
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name, default_sla_days: c.default_sla_days }));

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Checkout de Expedição"
          description="Confirme fisicamente a saída dos volumes. A coleta real inicia o SLA oficial."
        />
        <div className="pt-1">
          <RefreshTinyButton label="Atualizar pedidos (Tiny)" />
        </div>
      </div>
      <CheckoutClient carriers={carriers} />
    </>
  );
}

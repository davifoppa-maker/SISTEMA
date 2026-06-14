import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { loadStoreFor } from "@/lib/db";
import { CarriersClient } from "./carriers-client";

export const dynamic = "force-dynamic";

export default async function CarriersPage() {
  const store = await loadStoreFor(["carriers"]);
  const carriers = store.carriers.map((c) => ({
    id: c.id,
    name: c.name,
    mode: c.mode,
    default_sla_days: c.default_sla_days,
    tracking_url_template: c.tracking_url_template,
    portal_instructions: c.portal_instructions,
  }));
  return (
    <>
      <PageHeader
        title="Transportadoras"
        description="Como rastrear cada transportadora e o modo de integração (para conectores futuros via API). O prazo de cada pedido vem do Tiny (data prevista, que varia por CEP) — o SLA abaixo é só um fallback."
      />
      <Card>
        <CardContent className="p-0">
          <CarriersClient carriers={carriers} />
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-slate-400">
        O <strong>SLA fallback</strong> só é usado quando o pedido não traz a data prevista do Tiny (ex.: Lenoir = 2 dias úteis, sem rastreio).
        Modos <code>manual</code> e <code>portal</code> implementados; <code>api</code>/<code>edi</code>/<code>hub</code> têm
        adaptador preparado (ver src/lib/services/carrier.ts) para conectores futuros (Braspress, Rodonaves, Jadlog, Correios, J&T, hubs).
      </p>
    </>
  );
}

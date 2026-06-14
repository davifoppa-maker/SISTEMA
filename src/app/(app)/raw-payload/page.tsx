import { PageHeader } from "@/components/page-header";
import { RawPayloadClient } from "./raw-client";

export const dynamic = "force-dynamic";

export default function RawPayloadPage() {
  return (
    <>
      <PageHeader
        title="Payload bruto / diagnóstico de integração"
        description="Descubra onde o Tiny/Mercos informa a origem do pedido e configure regras de canal."
      />
      <RawPayloadClient />
    </>
  );
}

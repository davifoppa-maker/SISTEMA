import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getBraspressConfig } from "@/lib/services/braspress";
import { providerOptions } from "@/lib/services/freight/registry";
import { QuoteForm } from "../../orders/[id]/cotacao/quote-form";

export const dynamic = "force-dynamic";

// Cotação PERSONALIZADA: frete de uma carga que NÃO é pedido do sistema
// (cotações para clientes, simulações comerciais, cargas avulsas). Mesmo motor
// da cotação de pedidos — todas as transportadoras de uma vez.
export default function CotacaoPersonalizadaPage() {
  const cfg = getBraspressConfig("nyer");
  return (
    <>
      <PageHeader
        title="🧮 Cotação personalizada"
        description="Cote um frete avulso (sem pedido no sistema): preencha destino, valor, peso e caixas.">
        <Link href="/quotes" className="text-sm text-brand-700 hover:underline">← Cotações</Link>
      </PageHeader>
      <QuoteForm
        orderId=""
        providers={providerOptions()}
        prefill={{
          cnpjRemetente: cfg.cnpjRemetente,
          cepOrigem: cfg.cepOrigem,
          cnpjDestinatario: "",
          cepDestino: "",
          vlrMercadoria: 0,
          peso: 0,
          volumes: 1,
          empresa: "nyer",
        }}
      />
    </>
  );
}

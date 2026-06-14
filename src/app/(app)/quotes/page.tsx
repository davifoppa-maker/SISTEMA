import { PageHeader } from "@/components/page-header";
import { readStore } from "@/lib/queries";
import { providerOptions } from "@/lib/services/freight/registry";
import { calcularCubagem, cubagemParaLinhas } from "@/lib/services/freight/cubagem";
import { QuotesClient, type QuoteOrderOption } from "./quotes-client";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const store = await readStore();
  const orders: QuoteOrderOption[] = store.orders
    // Apenas pedidos B2B (Mercos). Os B2C (Nuvemshop) não passam por cotação manual.
    .filter((o) => o.channel === "b2b_mercos")
    // Pedido mais recente (maior número) no topo.
    .sort((a, b) => {
      const na = Number(a.order_number);
      const nb = Number(b.order_number);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return a.order_number < b.order_number ? 1 : -1;
    })
    .map((o) => {
      const customer = store.customers.find((c) => c.id === o.customer_id);
      const shipment = store.shipments.find((s) => s.order_id === o.id);
      const volumes = shipment ? store.shipment_volumes.filter((v) => v.shipment_id === shipment.id).length : 1;

      // Cubagem automática pelos itens do pedido (SKU → medidas → caixas 0–4).
      const itens = store.order_items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({ sku: i.sku, descricao: i.description, quantidade: i.quantity }));
      const cub = calcularCubagem(itens);
      const cubagem = {
        linhas: cubagemParaLinhas(cub),
        caixas: cub.caixas.map((c) => ({ nome: c.caixa.nome, quantidade: c.quantidade })),
        volumeItensM3: cub.volumeItensM3,
        semMedida: cub.semMedida,
        alertas: cub.alertas,
        totalCaixas: cub.caixas.reduce((s, c) => s + c.quantidade, 0),
      };

      return {
        id: o.id,
        order_number: o.order_number,
        customer_name: customer?.name ?? "—",
        customer_document: customer?.document ?? "—",
        city: o.city ?? "—",
        state: o.state ?? "—",
        total_value: o.total_value,
        volumes,
        weight: shipment?.total_weight ?? volumes * 8.5,
        cubagem,
      };
    });

  return (
    <>
      <PageHeader
        title="Cotação de frete"
        description="Cote automaticamente na Braspress (botão 'Cotar agora') ou gere um pacote para enviar por WhatsApp/e-mail."
      />
      {orders.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum pedido disponível.</p>
      ) : (
        <QuotesClient orders={orders} providers={providerOptions()} />
      )}
    </>
  );
}

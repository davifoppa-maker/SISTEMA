import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { readStore } from "@/lib/queries";
import { fetchOrderWeight, isTinyConfigured } from "@/lib/services/tiny-api";
import { getBraspressConfig } from "@/lib/services/braspress";
import { providerOptions } from "@/lib/services/freight/registry";
import { calcularCubagem, cubagemParaLinhas } from "@/lib/services/freight/cubagem";
import { QuoteForm } from "./quote-form";

export const dynamic = "force-dynamic";

export default async function CotacaoPage({ params }: { params: { id: string } }) {
  const store = await readStore();
  const order = store.orders.find((o) => o.id === params.id);
  if (!order) notFound();
  const customer = store.customers.find((c) => c.id === order.customer_id);

  // Puxa peso, CEP de destino e volumes do Tiny (best-effort) para pré-preencher.
  let peso: number | null = null;
  let cepDestino: string | null = null;
  let volumes: number | null = null;
  if (order.tiny_id && isTinyConfigured()) {
    try {
      const w = await fetchOrderWeight(order.tiny_id);
      peso = w.pesoBruto;
      cepDestino = w.cepDestino;
      volumes = w.volumes;
    } catch {
      // sem peso/CEP do Tiny — o usuário preenche manualmente
    }
  }

  const cfg = getBraspressConfig();

  // Cubagem automática: itens do pedido → medidas por SKU → empacotamento nas caixas.
  const itens = store.order_items
    .filter((i) => i.order_id === order.id)
    .map((i) => ({ sku: i.sku, descricao: i.description, quantidade: i.quantity }));
  const cubagem = calcularCubagem(itens);
  const totalCaixas = cubagem.caixas.reduce((s, c) => s + c.quantidade, 0);
  const cubagemAuto = {
    linhas: cubagemParaLinhas(cubagem),
    caixas: cubagem.caixas.map((c) => ({ nome: c.caixa.nome, quantidade: c.quantidade })),
    volumeItensM3: cubagem.volumeItensM3,
    semMedida: cubagem.semMedida,
    alertas: cubagem.alertas,
  };

  return (
    <>
      <PageHeader title={`Cotar frete — Pedido #${order.order_number}`} description={customer?.name ?? undefined}>
        <Link href={`/orders/${order.id}`} className="text-sm text-brand-700 hover:underline">← Voltar ao pedido</Link>
      </PageHeader>

      <QuoteForm
        orderId={order.id}
        providers={providerOptions()}
        prefill={{
          cnpjRemetente: cfg.cnpjRemetente,
          cepOrigem: cfg.cepOrigem,
          cnpjDestinatario: customer?.document ?? "",
          cepDestino: cepDestino ?? "",
          vlrMercadoria: order.total_value ?? 0,
          peso: peso ?? 0,
          // volumes da cubagem automática quando houver; senão o do Tiny.
          volumes: totalCaixas > 0 ? totalCaixas : volumes ?? 1,
        }}
        cubagemAuto={cubagemAuto}
      />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { getBraspressConfig } from "@/lib/services/braspress";
import { providerOptions } from "@/lib/services/freight/registry";
import { calcularCubagem, cubagemParaLinhas } from "@/lib/services/freight/cubagem";
import { QuoteForm } from "./quote-form";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export default async function CotacaoPage({ params }: { params: { id: string } }) {
  // Consultas DIRECIONADAS (1 pedido) — antes carregava 3 tabelas inteiras.
  const sb = getSupabaseAdmin();
  const [{ data: order }, { data: orderItems }] = await Promise.all([
    sb.from("orders").select("*").eq("id", params.id).maybeSingle(),
    sb.from("order_items").select("sku, description, quantity").eq("order_id", params.id),
  ]);
  if (!order) notFound();
  const { data: customer } = order.customer_id
    ? await sb.from("customers").select("name, document").eq("id", order.customer_id).maybeSingle()
    : { data: null };

  // Peso/CEP/volumes do Tiny NÃO bloqueiam mais a página — o QuoteForm busca em
  // segundo plano (/api/orders/[id]/tiny-info) e preenche quando chegar.
  const peso: number | null = null;
  const cepDestino: string | null = null;
  const volumes: number | null = null;

  const empresa = (order as any).empresa ?? "nyer";
  const cfg = getBraspressConfig(empresa);

  // Cubagem automática: itens do pedido → medidas por SKU → empacotamento nas caixas.
  const itens = (orderItems ?? [])
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
          empresa,
        }}
        cubagemAuto={cubagemAuto}
      />
    </>
  );
}

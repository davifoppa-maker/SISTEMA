import { loadStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { getProvider, providerIdForCarrierName } from "@/lib/services/freight/registry";
import { fetchOrderNF } from "@/lib/services/tiny-api";
import { probeJadlog } from "@/lib/services/freight/jadlog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico SÓ-LEITURA de rastreio: chama o track() da transportadora e mostra
// o que a API devolve (status, data de entrega, timeline). Protegido por chave.
//
// Uso:
//   /api/debug/rastreio?provider=jadlog&nf=12345&k=exxdebug
//   /api/debug/rastreio?numero=72400&k=exxdebug   (resolve NF + transportadora do pedido)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  let providerId = url.searchParams.get("provider") ?? undefined;
  let nf = url.searchParams.get("nf") ?? undefined;
  let chave = url.searchParams.get("chave") ?? undefined;
  let codigo = url.searchParams.get("codigo") ?? undefined;
  const cnpj = url.searchParams.get("cnpj") ?? undefined;
  const numero = url.searchParams.get("numero") ?? undefined;

  let pedidoInfo: Record<string, unknown> | undefined;
  let tinyId: string | undefined;
  if (numero) {
    const store = await loadStore();
    const order = store.orders.find((o) => o.order_number === numero);
    if (!order) return fail(`Pedido nº ${numero} não encontrado.`, 404);
    nf = nf ?? order.nf_numero ?? undefined;
    chave = chave ?? order.nf_chave ?? undefined;
    tinyId = order.tiny_id ?? undefined;
    // Código de rastreio da expedição (ex.: shipmentId da Jadlog).
    const shipment = store.shipments.find((s) => s.order_id === order.id && s.tracking_code);
    codigo = codigo ?? shipment?.tracking_code ?? undefined;
    if (!providerId && order.carrier_name) providerId = providerIdForCarrierName(order.carrier_name) ?? undefined;
    pedidoInfo = {
      order_number: order.order_number,
      carrier_name: order.carrier_name,
      nf_numero: order.nf_numero,
      nf_chave: order.nf_chave,
      tracking_code: shipment?.tracking_code ?? null,
      logistic_status: order.logistic_status,
      expected_delivery_at: order.expected_delivery_at,
    };
  }

  const provider = getProvider(providerId);
  if (!provider) return fail(`Transportadora inválida: ${providerId ?? "(vazio)"}. Use provider=braspress|jadlog|arlete|lenoir.`, 422);
  if (!provider.isConfigured()) {
    return ok({ provider: provider.id, configurada: false, aviso: "Sem credenciais configuradas neste ambiente.", pedidoInfo });
  }

  // Identificador de rastreio por transportadora:
  //  - Arlete (SSW): CHAVE da NF-e (44 díg.) — busca no Tiny se não estiver salva
  //  - Jadlog: shipmentId (= "Código de rastreamento" da expedição)
  //  - demais (Braspress…): número da NF
  if (provider.id === "arlete" && !chave && tinyId) {
    const info = await fetchOrderNF(tinyId).catch(() => null);
    if (info?.chave) {
      chave = info.chave;
      if (pedidoInfo) pedidoInfo.nf_chave_buscada_no_tiny = info.chave;
    }
  }
  // Modo probe da Jadlog: testa todas as formas de consulta e mostra qual achou.
  if (provider.id === "jadlog" && url.searchParams.get("probe") === "1") {
    const diag = await probeJadlog({ nf: nf ?? undefined, chave: chave ?? undefined, codigo: codigo ?? undefined });
    return ok({ provider: "jadlog", modo: "probe", nf, chave, codigo, pedidoInfo, ...diag });
  }

  const identificador = provider.id === "arlete" ? chave : provider.id === "jadlog" ? codigo : nf;
  if (!identificador) {
    return fail(
      provider.id === "arlete"
        ? "Arlete precisa da CHAVE da NF-e (44 díg.) — não está salva e não foi possível buscar no Tiny. Passe ?chave=."
        : provider.id === "jadlog"
          ? "Jadlog precisa do código de rastreio (shipmentId) — não está salvo na expedição. Passe ?codigo=."
          : "Informe ?nf= (ou ?numero= de um pedido com NF).",
      422,
    );
  }

  const resultado = await provider.track(identificador, cnpj);
  return ok({ provider: provider.id, configurada: true, identificadorUsado: identificador, pedidoInfo, resultado });
}

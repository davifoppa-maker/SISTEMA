import { loadStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { testarTransporteTiny, dumpFormasFreteRaw, isTinyConfigured } from "@/lib/services/tiny-api";

export const maxDuration = 30;

/**
 * Endpoint de DIAGNÓSTICO (não faz parte do fluxo de produção). Sonda as duas
 * abordagens sugeridas pelo suporte do Tiny para gravar a transportadora num
 * pedido sem NF, e devolve o JSON cru de cada tentativa + a releitura do pedido.
 *
 * Uso (no preview):
 *   /api/debug/tiny-transporte?orderId=<id-interno>
 *   /api/debug/tiny-transporte?tinyId=<id-do-tiny>&carrier=Lenoir&volumes=1
 *
 * Quando `orderId` é informado, resolvemos o tinyId e a transportadora a partir
 * do pedido no nosso sistema.
 */
// Endpoint de diagnóstico: habilitado fora de produção (preview/dev) ou quando
// ENABLE_TINY_DEBUG=1. Em produção fica DESLIGADO por padrão (ele consegue
// escrever em pedido), evitando exposição.
function debugHabilitado(): boolean {
  return process.env.VERCEL_ENV !== "production" || process.env.ENABLE_TINY_DEBUG === "1";
}

export async function GET(req: Request) {
  if (!debugHabilitado()) return fail("Não encontrado.", 404);
  if (!isTinyConfigured()) return fail("Olist Tiny não configurado neste ambiente.", 400);

  const url = new URL(req.url);
  let tinyId = url.searchParams.get("tinyId") ?? undefined;
  let carrier = url.searchParams.get("carrier") ?? undefined;
  const orderId = url.searchParams.get("orderId") ?? undefined;
  const provider = url.searchParams.get("provider") ?? undefined;
  const volumesRaw = url.searchParams.get("volumes");
  const volumes = volumesRaw != null && volumesRaw !== "" ? Number(volumesRaw) : undefined;
  const idFormaRaw = url.searchParams.get("idFormaEnvio");
  const idFormaEnvio = idFormaRaw != null && idFormaRaw !== "" ? Number(idFormaRaw) : undefined;
  const idFreteRaw = url.searchParams.get("idFormaFrete");
  const idFormaFrete = idFreteRaw != null && idFreteRaw !== "" ? Number(idFreteRaw) : undefined;
  const idContatoRaw = url.searchParams.get("idContato");
  const idContato = idContatoRaw != null && idContatoRaw !== "" ? Number(idContatoRaw) : undefined;
  const nome = url.searchParams.get("nome") ?? undefined;
  const freteRaw = url.searchParams.get("frete");
  const frete = freteRaw != null && freteRaw !== "" ? Number(freteRaw.replace(",", ".")) : undefined;
  const testarExpedicao = url.searchParams.get("expedicao") === "1";

  // Modo descoberta: lista formas de frete + contatos (e seus IDs). Sem pedido.
  if (url.searchParams.get("dump") === "1") {
    try {
      return ok({ dump: await dumpFormasFreteRaw(idFormaEnvio, nome ?? carrier) });
    } catch (err) {
      return fail((err as Error).message, 500);
    }
  }

  if (!tinyId && orderId) {
    const store = await loadStore();
    const order = store.orders.find((o) => o.id === orderId);
    if (!order) return fail("Pedido não encontrado.", 404);
    tinyId = order.tiny_id ?? undefined;
    carrier = carrier ?? order.carrier_name ?? undefined;
  }

  if (!tinyId) return fail("Informe tinyId ou orderId.", 422);
  // carrier só é obrigatório quando NÃO se passa um idFormaEnvio fixo.
  if (!carrier && idFormaEnvio == null)
    return fail("Informe carrier ou idFormaEnvio.", 422);

  try {
    const result = await testarTransporteTiny(tinyId, carrier ?? "", {
      provider,
      volumes,
      idFormaEnvio,
      idFormaFrete,
      idContato,
      frete,
      testarExpedicao,
    });
    return ok({ tinyId, carrier, ...result });
  } catch (err) {
    return fail((err as Error).message, 500);
  }
}

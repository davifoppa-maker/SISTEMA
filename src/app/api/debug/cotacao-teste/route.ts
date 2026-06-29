import { ok, fail } from "@/lib/api";
import { getProvider } from "@/lib/services/freight/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico: dispara uma cotação de teste numa transportadora e devolve a
// resposta CRUA (raw) + status, para ajustarmos o mapeamento dos campos.
// Ex.: /api/debug/cotacao-teste?k=exxdebug&provider=brudam&cepDestino=01001000
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const providerId = url.searchParams.get("provider") || "brudam";
  const provider = getProvider(providerId);
  if (!provider) return fail(`Transportadora desconhecida: ${providerId}`, 404);

  const cepDestino = url.searchParams.get("cepDestino") || "01001000";
  const cnpjDestinatario = url.searchParams.get("cnpjDest") || "45997418000153"; // CNPJ público de exemplo

  const outcome = await provider.quote({
    cnpjDestinatario,
    cepDestino,
    vlrMercadoria: 100,
    peso: 5,
    volumes: 1,
    cubagem: [{ altura: 0.2, largura: 0.3, comprimento: 0.4, volumes: 1 }],
    modal: "R",
    tipoFrete: "1",
  });

  return ok({ provider: providerId, configured: provider.isConfigured(), outcome });
}

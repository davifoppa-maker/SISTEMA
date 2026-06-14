import { ok, fail } from "@/lib/api";
import { getProvider } from "@/lib/services/freight/registry";

export const maxDuration = 30;

/** GET /api/tracking/{provider}?nf=123456[&cnpj=...] — rastreia pela nota fiscal. */
export async function GET(req: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return fail(`Transportadora desconhecida: ${params.provider}`, 404);

  const url = new URL(req.url);
  const nf = url.searchParams.get("nf") ?? "";
  const cnpj = url.searchParams.get("cnpj") ?? undefined;
  if (!nf.trim()) return fail("Informe o número da nota fiscal (nf).", 422);

  const outcome = await provider.track(nf, cnpj);
  if (!outcome.ok) {
    return fail(outcome.error, outcome.status === 404 ? 404 : outcome.status && outcome.status >= 400 ? 502 : 400);
  }
  return ok(outcome.data);
}

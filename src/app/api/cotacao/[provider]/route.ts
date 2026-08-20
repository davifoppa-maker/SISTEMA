import { z } from "zod";
import { ok, fail, parseBody } from "@/lib/api";
import { getProvider } from "@/lib/services/freight/registry";
import { ufDoCep, msgNaoAtende } from "@/lib/services/freight/regiao";

export const maxDuration = 10;

const cubagemSchema = z.object({
  altura: z.coerce.number().positive(),
  largura: z.coerce.number().positive(),
  comprimento: z.coerce.number().positive(),
  volumes: z.coerce.number().int().positive(),
});

const schema = z.object({
  cnpjDestinatario: z.string().optional().default(""),
  cepDestino: z.string().min(1),
  vlrMercadoria: z.coerce.number().nonnegative(),
  peso: z.coerce.number().nonnegative(),
  volumes: z.coerce.number().int().positive(),
  cubagem: z.array(cubagemSchema).min(1),
  cnpjRemetente: z.string().optional(),
  cepOrigem: z.string().optional(),
  modal: z.string().optional(),
  tipoFrete: z.string().optional(),
  empresa: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return fail(`Transportadora desconhecida: ${params.provider}`, 404);

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  // Pré-checagem de cobertura por UF (levantamento validado): destino fora da
  // área da transportadora responde na hora, sem gastar chamada de API.
  if (provider.ufsAtendidas) {
    const uf = ufDoCep(parsed.data.cepDestino);
    if (uf && !provider.ufsAtendidas.includes(uf)) {
      return fail(msgNaoAtende(provider.label), 400);
    }
  }

  const outcome = await provider.quote(parsed.data);
  if (!outcome.ok) {
    return fail(outcome.error, outcome.status && outcome.status >= 400 ? 502 : 400, outcome.detail);
  }
  return ok(outcome.data);
}

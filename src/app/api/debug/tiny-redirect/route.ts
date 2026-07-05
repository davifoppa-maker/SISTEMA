import { ok, fail } from "@/lib/api";
import { getTinyConfig } from "@/lib/services/tiny-api";

export const dynamic = "force-dynamic";

// Mostra o redirect_uri que o app envia no OAuth de cada empresa — para conferir
// se bate com o cadastrado no painel do Tiny.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);

  const nyer = getTinyConfig("nyer");
  const ecopro = getTinyConfig("ecopro");
  return ok({
    nyer: { redirect_uri: nyer.redirectUri, client_id: nyer.clientId?.slice(0, 8) + "…" },
    ecopro: { redirect_uri: ecopro.redirectUri, client_id: ecopro.clientId?.slice(0, 8) + "…" },
    APP_URL: process.env.APP_URL ?? null,
    ECOPRO_TINY_REDIRECT_URI: process.env.ECOPRO_TINY_REDIRECT_URI ?? "(não definido)",
  });
}

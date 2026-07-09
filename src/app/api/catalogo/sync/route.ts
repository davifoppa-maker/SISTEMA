import { ok, fail } from "@/lib/api";
import { syncUnknownProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cadastra na aba Custos & Preços qualquer produto vendido que ainda não tem
// custo (entra com custo 0 para preencher depois). GET e POST equivalentes.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const r = await syncUnknownProducts();
  return ok(r);
}
export async function POST() {
  const r = await syncUnknownProducts();
  return ok(r);
}

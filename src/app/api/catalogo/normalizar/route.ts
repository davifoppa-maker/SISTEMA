import { ok, fail } from "@/lib/api";
import { normalizarSkus } from "@/lib/sku-normalize";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Peneira de SKUs divergentes -> SKU padrão (que já tem custo).
//   Preview (não altera nada): GET /api/catalogo/normalizar?k=exxdebug
//   Aplicar (troca sku nos pedidos + remove duplicata): GET ...?k=exxdebug&apply=1
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  const apply = url.searchParams.get("apply") === "1";
  const r = await normalizarSkus(apply);
  return ok(r);
}

// POST sempre aplica.
export async function POST() {
  const r = await normalizarSkus(true);
  return ok(r);
}

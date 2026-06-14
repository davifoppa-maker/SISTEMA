import { loadStore, commitStore } from "@/lib/db";
import { ok, fail } from "@/lib/api";
import { finalizeCheckoutBatch } from "@/lib/services/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Checkout em LOTE: finaliza vários pedidos da mesma transportadora num único
// romaneio. items = [{ shipment_id, scanned_codes: [...] }].
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    items?: { shipment_id: string; scanned_codes: string[] }[];
    carrier_id?: string | null;
    carrier_name?: string | null;
    collector_name?: string | null;
    notes?: string | null;
  };
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return fail("Bipe ao menos 1 volume antes de finalizar.", 400);
  }

  const store = await loadStore();
  try {
    const res = await finalizeCheckoutBatch(store, {
      items: body.items,
      carrier_id: body.carrier_id ?? null,
      carrier_name: body.carrier_name ?? null,
      collector_name: body.collector_name ?? null,
      notes: body.notes ?? null,
    });
    await commitStore(store);
    return ok(res);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Falha ao finalizar coleta", 422);
  }
}

import { ok } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function readBody(req: Request): Promise<any> {
  const ct = req.headers.get("content-type") || "";
  const text = await req.text();
  if (!text) return {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const dados = params.get("dados");
    if (dados) {
      try { return JSON.parse(dados); } catch { return { dados }; }
    }
    const obj: Record<string, string> = {};
    params.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

function parseTinyDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

function extractSupplier(item: any, rawDesc: string): string {
  const fromDesc = rawDesc.match(/,\s*([^,(]+?)(?:\s*\(|$)/)?.[1]?.trim();
  return (
    item.fornecedor?.nome ??
    item.contato?.nome ??
    item.nomeFornecedor ??
    fromDesc ??
    rawDesc.slice(0, 60)
  ) || "—";
}

// Webhook de eventos financeiros do Tiny (contas a pagar e a receber).
// Sempre responde 200 para o Tiny não re-enviar em loop.
export async function POST(req: Request) {
  try {
    const payload = await readBody(req);
    const entity = payload?.dados ?? payload?.contaPagar ?? payload?.conta ?? payload;

    const tinyId = String(entity?.id ?? "");
    if (!tinyId) return ok({ received: true, skipped: "sem id" });

    const rawDesc: string = entity?.historico ?? entity?.descricao ?? entity?.observacoes ?? "";
    const supplier = extractSupplier(entity, rawDesc);
    const dueDate = parseTinyDate(entity?.dataVencimento ?? entity?.vencimento);
    const value = parseFloat(String(entity?.valor ?? entity?.valorOriginal ?? 0)) || 0;

    if (!dueDate || !value) return ok({ received: true, skipped: "sem vencimento ou valor" });

    const row = {
      tiny_id: tinyId,
      supplier,
      description: rawDesc || null,
      value,
      issue_date: parseTinyDate(entity?.dataEmissao ?? entity?.dataCriacao) ?? dueDate,
      due_date: dueDate,
      paid_at: parseTinyDate(entity?.dataPagamento ?? entity?.dataBaixa),
      category: entity?.categoria?.descricao ?? entity?.categoria ?? null,
      notes: null,
    };

    const sb = getSupabaseAdmin();
    const { error } = await sb
      .from("payables")
      .upsert(row, { onConflict: "tiny_id" });

    if (error) return ok({ received: true, error: error.message });

    return ok({ received: true, processed: true, tiny_id: tinyId });
  } catch {
    return ok({ received: true, processed: false });
  }
}

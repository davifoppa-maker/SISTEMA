import { getSupabaseAdmin } from "@/lib/db/supabase-store";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("JSON inválido", 400);
  }

  const {
    supplier,
    description,
    value,
    issue_date,
    due_date,
    category,
    notes,
  } = body as Record<string, unknown>;

  if (!supplier || typeof supplier !== "string" || supplier.trim() === "") {
    return fail("Fornecedor é obrigatório", 400);
  }
  if (value === undefined || value === null || isNaN(Number(value))) {
    return fail("Valor é obrigatório", 400);
  }
  if (!issue_date || typeof issue_date !== "string") {
    return fail("Data de emissão é obrigatória", 400);
  }
  if (!due_date || typeof due_date !== "string") {
    return fail("Data de vencimento é obrigatória", 400);
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("payables")
    .insert({
      supplier: supplier.trim(),
      description: description ? String(description) : null,
      value: Number(value),
      issue_date: String(issue_date),
      due_date: String(due_date),
      category: category ? String(category) : null,
      notes: notes ? String(notes) : null,
    })
    .select()
    .single();

  if (error) {
    return fail(error.message, 500);
  }

  return ok(data, 201);
}

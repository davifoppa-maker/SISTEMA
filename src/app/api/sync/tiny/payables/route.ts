import { ok, fail } from "@/lib/api";
import { isTinyConnected, fetchTinyPayables } from "@/lib/services/tiny-api";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const maxDuration = 60;

const COMPANIES = [
  { id: "nyer", label: "NRX" },
  { id: "ecopro", label: "Ecopro" },
] as const;

async function fetchAll(companyId: string, situacao?: number) {
  const collected: Awaited<ReturnType<typeof fetchTinyPayables>> = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const page = await fetchTinyPayables({ situacao, limit: 100, offset }, companyId);
    collected.push(...page);
    if (page.length < 100) break;
  }
  return collected;
}

// Sincroniza CONTAS A PAGAR das DUAS empresas (NRX + Ecopro) do Olist Tiny.
// tiny_id é prefixado por empresa ("nyer:123") para não colidir entre as contas.
export async function POST() {
  const diag: Record<string, unknown> = {};
  const rows: any[] = [];

  for (const emp of COMPANIES) {
    const conectado = await isTinyConnected(emp.id).catch(() => false);
    if (!conectado) { diag[emp.id] = "não conectado"; continue; }
    try {
      const [todas, pagas] = await Promise.all([fetchAll(emp.id), fetchAll(emp.id, 2)]);
      // Deduplica por tiny_id dentro da empresa.
      const byId = new Map<string, (typeof todas)[number]>();
      for (const p of [...todas, ...pagas]) if (p.tiny_id) byId.set(p.tiny_id, p);
      diag[emp.id] = byId.size;
      for (const p of byId.values()) {
        rows.push({
          tiny_id: `${emp.id}:${p.tiny_id}`, // namespaced por empresa
          supplier: p.supplier,
          description: p.description,
          value: p.value,
          issue_date: p.issue_date ?? p.due_date,
          due_date: p.due_date,
          paid_at: p.paid_at,
          category: p.category,
          notes: emp.label, // guarda a empresa (não há coluna própria)
        });
      }
    } catch (e) {
      diag[`${emp.id}_erro`] = e instanceof Error ? e.message : String(e);
    }
  }

  if (rows.length === 0) {
    const algumConectado = Object.values(diag).some((v) => typeof v === "number");
    if (!algumConectado) return fail("Tiny não conectado (nenhuma empresa)", 400, diag);
    return ok({ synced: 0, diag });
  }

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("payables").upsert(rows, { onConflict: "tiny_id" });
  if (error) return fail(`Erro ao salvar: ${error.message}`, 500);

  return ok({ synced: rows.length, diag });
}

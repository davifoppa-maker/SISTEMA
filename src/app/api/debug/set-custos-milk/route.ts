import { ok, fail } from "@/lib/api";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Grava os custos dos Milk Protein 80 no catalog_custos, achando o produto pelo
// NOME (tamanho + sabor). Dry-run por padrão; grava só com &apply=1.
//   GET /api/debug/set-custos-milk?k=exxdebug          (dry-run)
//   GET /api/debug/set-custos-milk?k=exxdebug&apply=1  (grava)
const ALVOS: { size: string[]; flavor: string; cost: number }[] = [
  { size: ["900"], flavor: "chocolate", cost: 58.95 },
  { size: ["900"], flavor: "morango", cost: 58.95 },
  { size: ["900"], flavor: "original", cost: 58.95 },
  { size: ["1,8", "1.8", "1800"], flavor: "chocolate", cost: 91.0 },
  { size: ["1,8", "1.8", "1800"], flavor: "morango", cost: 91.0 },
  { size: ["1,8", "1.8", "1800"], flavor: "original", cost: 91.0 },
];

const norm = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("k") !== "exxdebug") return fail("não autorizado", 403);
  if (!isSupabaseConfigured()) return fail("supabase não configurado", 500);
  const apply = url.searchParams.get("apply") === "1";
  const sb = getSupabaseAdmin();

  // Candidatos: produtos já cadastrados (catalog_custos) + descrições de itens vendidos.
  const { data: cc } = await sb.from("catalog_custos").select("sku,name,cost");
  const candidatos = new Map<string, { name: string; cost: number | null }>();
  for (const r of (cc ?? []) as any[]) candidatos.set(String(r.sku), { name: r.name ?? "", cost: r.cost });

  // Também varre order_items para achar SKUs de Milk Protein ainda não no catálogo.
  for (let from = 0; ; from += 1000) {
    const { data } = await sb.from("order_items").select("sku, description").order("id").range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const it of data as any[]) {
      const sku = (it.sku ?? "").trim();
      if (!sku || candidatos.has(sku)) continue;
      if (norm(it.description ?? "").includes("milk protein")) candidatos.set(sku, { name: it.description ?? sku, cost: null });
    }
    if (data.length < 1000) break;
  }

  const casaSabor = (n: string, flavor: string) => {
    if (flavor === "original") return n.includes("original") || n.includes("natural") || (!n.includes("chocolate") && !n.includes("morango"));
    return n.includes(flavor);
  };

  const planoUpsert: any[] = [];
  const resultado = ALVOS.map((a) => {
    const matches = [...candidatos.entries()].filter(([, v]) => {
      const n = norm(v.name);
      if (!n.includes("milk protein")) return false;
      if (!a.size.some((s) => n.includes(norm(s)))) return false;
      // evita 1,8kg casar como 900 (ambos têm dígitos): exige o token do tamanho
      if (a.size.includes("900") && (n.includes("1,8") || n.includes("1.8") || n.includes("1800"))) return false;
      return casaSabor(n, a.flavor);
    });
    for (const [sku, v] of matches) {
      planoUpsert.push({ sku, name: v.name, cost: a.cost, updated_at: new Date().toISOString() });
    }
    return {
      alvo: `Milk Protein 80 ${a.size[0]} ${a.flavor}`,
      custo: a.cost,
      encontrados: matches.map(([sku, v]) => ({ sku, name: v.name, custo_atual: v.cost })),
    };
  });

  let gravados = 0;
  if (apply && planoUpsert.length > 0) {
    // upsert só de sku+cost+name (não mexe em tabela/type).
    const rows = planoUpsert.map((r) => ({ sku: r.sku, name: r.name, cost: r.cost, updated_at: r.updated_at }));
    const { error } = await sb.from("catalog_custos").upsert(rows, { onConflict: "sku" });
    if (error) return fail(`erro ao gravar: ${error.message}`, 500);
    gravados = rows.length;
  }

  return ok({
    modo: apply ? "APLICADO" : "dry-run (nada gravado — use &apply=1 para gravar)",
    gravados,
    resultado,
    aviso: resultado.some((r) => r.encontrados.length === 0)
      ? "Algum alvo não encontrou produto — confira o nome/SKU (talvez ainda não vendido ou nome diferente)."
      : null,
  });
}

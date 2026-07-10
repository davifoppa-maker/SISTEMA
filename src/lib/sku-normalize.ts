import { CATALOG, type Product } from "@/lib/product-costs";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/db/supabase-store";

// Peneira de SKUs: muitos pedidos chegam com um SKU divergente para um produto
// que JÁ temos no catálogo padrão (com custo). Este módulo casa a descrição do
// item com o produto padrão e normaliza o SKU no próprio pedido (order_items),
// removendo a duplicata da aba Custos & Preços.
//
// A regra de casamento é CONSERVADORA de propósito (custo é sensível): só casa
// quando TODOS os tokens do nome padrão aparecem na descrição do item E o
// tamanho (900g/1kg/300g...) bate. Se ficar ambíguo (2+ candidatos), NÃO casa.

// Só conectores. NÃO incluir palavras que distinguem produtos (pote/refil/pouch).
const STOP = new Set(["de", "e", "com", "para", "da", "do", "sabor"]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Normaliza um tamanho para uma forma canônica: "1 kg" -> "1kg", "900 g" -> "900g".
function sizeTokens(norm: string): string[] {
  const out: string[] = [];
  const re = /(\d+(?:[.,]\d+)?)\s?(kg|g|ml|l|caps?|capsulas?|comp|un)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    const num = m[1].replace(",", ".");
    let unit = m[2];
    if (unit === "cap" || unit === "caps" || unit === "capsula" || unit === "capsulas") unit = "cap";
    out.push(`${num}${unit}`);
  }
  return out;
}

// Sinônimos / variações de grafia -> forma canônica (do catálogo).
// Ex.: "refil" (1 L) e "refill" (2 L) são o mesmo; "hidro" e "hydro" idem.
const SYN: Record<string, string> = {
  refil: "refill",
  refill: "refill",
  hidro: "hydro",
  hydro: "hydro",
  proteina: "protein",
  protein: "protein",
  pre: "pre",
  pré: "pre",
  workout: "workout",
  monoidratada: "monohidratada",
  monohidratada: "monohidratada",
};

// Conjunto de tokens "significativos" de um texto (para comparação).
function tokens(text: string): { words: Set<string>; sizes: Set<string> } {
  const norm = stripAccents((text || "").toLowerCase());
  const sizes = new Set(sizeTokens(norm));
  const words = new Set<string>();
  for (const w of norm.replace(/[^a-z0-9]+/g, " ").split(" ")) {
    if (!w || STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // números soltos entram via sizes
    if (w.length < 2) continue;
    words.add(SYN[w] ?? w);
  }
  return { words, sizes };
}

// Sinaliza que o item é um produto NYER (só unificamos produto Nyer com o
// catálogo padrão Nyer — evita casar linha da Ecopro/Lab Skull por engano).
function ehNyer(description: string, sku?: string | null): boolean {
  return /nyer/i.test(description || "") || /^nyer/i.test((sku || "").trim());
}

// Pré-computa a assinatura de cada produto padrão do catálogo estático.
const CATALOG_SIG: { p: Product; words: Set<string>; sizes: Set<string> }[] = CATALOG.map((p) => {
  const t = tokens(p.name);
  return { p, words: t.words, sizes: t.sizes };
});

/**
 * Casa uma descrição de item com um produto PADRÃO do catálogo estático.
 * Retorna o produto canônico apenas quando o casamento é único e confiante.
 */
export function matchStandard(description: string, sku?: string | null): Product | null {
  // Só unifica com o catálogo padrão (100% Nyer) quando o item é Nyer.
  if (!ehNyer(description, sku)) return null;
  const t = tokens(description);
  if (t.words.size === 0) return null;

  const hits: Product[] = [];
  for (const c of CATALOG_SIG) {
    if (c.words.size === 0) continue;
    // Todos os tokens do nome padrão precisam estar na descrição do item.
    let coversWords = true;
    for (const w of c.words) if (!t.words.has(w)) { coversWords = false; break; }
    if (!coversWords) continue;
    // Se o padrão tem tamanho, a descrição precisa ter o MESMO tamanho.
    if (c.sizes.size > 0) {
      let sizeOk = true;
      for (const s of c.sizes) if (!t.sizes.has(s)) { sizeOk = false; break; }
      if (!sizeOk) continue;
    }
    hits.push(c.p);
  }
  // Único candidato => confiante. Ambíguo ou nenhum => não normaliza.
  return hits.length === 1 ? hits[0] : null;
}

export interface NormMapping {
  from: string; // sku divergente
  to: string; // sku padrão
  descricao: string;
  produto: string; // nome padrão
  linhas: number; // qtd de itens de pedido afetados
}

/**
 * Percorre todos os order_items, identifica SKUs divergentes que casam com um
 * produto padrão e monta o mapa de normalização.
 * @param apply quando true, TROCA o sku nos order_items e remove a duplicata de catalog_custos.
 */
export async function normalizarSkus(apply: boolean): Promise<{
  aplicado: boolean;
  mapeados: NormMapping[];
  itensAtualizados: number;
  removidosDoCadastro: number;
}> {
  if (!isSupabaseConfigured()) return { aplicado: false, mapeados: [], itensAtualizados: 0, removidosDoCadastro: 0 };
  const sb = getSupabaseAdmin();

  const conhecidos = new Set(CATALOG.map((p) => p.sku));

  // Coleta: para cada sku divergente, uma descrição representativa e a contagem.
  const info = new Map<string, { desc: string; linhas: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("order_items")
      .select("sku, description")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error || !data || data.length === 0) break;
    for (const it of data as any[]) {
      const sku = (it.sku ?? "").trim();
      if (!sku || conhecidos.has(sku)) continue;
      const cur = info.get(sku);
      if (cur) { cur.linhas++; if (!cur.desc && it.description) cur.desc = it.description; }
      else info.set(sku, { desc: it.description ?? "", linhas: 1 });
    }
    if (data.length < 1000) break;
  }

  const mapeados: NormMapping[] = [];
  for (const [sku, { desc, linhas }] of info) {
    const std = matchStandard(desc, sku);
    if (!std || std.sku === sku) continue;
    mapeados.push({ from: sku, to: std.sku, descricao: desc, produto: std.name, linhas });
  }
  mapeados.sort((a, b) => b.linhas - a.linhas);

  let itensAtualizados = 0;
  let removidosDoCadastro = 0;
  if (apply) {
    for (const m of mapeados) {
      const { error } = await sb.from("order_items").update({ sku: m.to }).eq("sku", m.from);
      if (!error) {
        itensAtualizados += m.linhas;
        // Remove a duplicata (com custo 0) do cadastro; o padrão já existe.
        const { error: delErr } = await sb.from("catalog_custos").delete().eq("sku", m.from);
        if (!delErr) removidosDoCadastro++;
      }
    }
  }

  return { aplicado: apply, mapeados, itensAtualizados, removidosDoCadastro };
}

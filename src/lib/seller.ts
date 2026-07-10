// Normalização de nomes de vendedor. O nome vem como texto livre do Tiny, então
// o MESMO vendedor aparece com variações (espaços/maiúsculas) ou com o nome
// parcial vs completo ("Amanda de Castilhos" x "Amanda de Castilhos Angioletti").
// Sem tratamento, o dashboard conta o vendedor duas vezes.

export const SEM_VENDEDOR = "Sem vendedor";

// Apelidos EXPLÍCITOS de vendedor: chave normalizada (sem acento/minúscula) ->
// nome canônico. Garante a união mesmo quando a heurística automática não pega.
const SELLER_ALIASES: Record<string, string> = {
  "amanda de castilhos": "Amanda de Castilhos Angioletti",
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Limpa espaços e devolve o nome exibível (ou "Sem vendedor"). */
export function normSeller(raw: string | null | undefined): string {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  return s || SEM_VENDEDOR;
}

/** Chave de comparação: sem acento, minúscula, espaços colapsados. */
function key(display: string): string {
  return stripAccents(display.toLowerCase()).replace(/\s+/g, " ").trim();
}

/**
 * Constrói um canonicalizador a partir de TODOS os nomes de vendedor existentes.
 * Junta:
 *   - variações que só diferem em espaço/acento/maiúscula (mesma chave);
 *   - nome parcial que é PREFIXO de palavras de um nome mais completo
 *     (ex.: "amanda de castilhos" -> "amanda de castilhos angioletti"),
 *     exigindo pelo menos 2 palavras no nome parcial para evitar juntar
 *     pessoas diferentes que só compartilham o primeiro nome.
 * Retorna uma função que mapeia qualquer nome bruto para o nome canônico exibível.
 */
export function buildSellerCanonicalizer(rawNames: Iterable<string | null | undefined>): (raw: string | null | undefined) => string {
  // Chave -> melhor forma de exibição (a mais longa/completa vista).
  const displayByKey = new Map<string, string>();
  for (const r of rawNames) {
    const disp = normSeller(r);
    if (disp === SEM_VENDEDOR) continue;
    const k = key(disp);
    const cur = displayByKey.get(k);
    if (!cur || disp.length > cur.length) displayByKey.set(k, disp);
  }

  const keys = [...displayByKey.keys()];
  // canonicalKey[k] = chave do vendedor canônico (nome mais completo).
  const canonicalKey = new Map<string, string>();
  for (const k of keys) {
    const words = k.split(" ");
    if (words.length < 2) { canonicalKey.set(k, k); continue; }
    // Procura o nome MAIS LONGO que "contém" o nome `k`: mesmo primeiro nome e
    // todas as palavras de `k` presentes (não precisa ser prefixo contíguo, para
    // pegar variações como "Amanda de Castilhos" x "Amanda Castilhos Angioletti").
    let best = k;
    let bestLen = words.length;
    for (const other of keys) {
      if (other === k) continue;
      const ow = other.split(" ");
      if (ow.length <= bestLen) continue;
      if (ow[0] !== words[0]) continue; // mesmo primeiro nome
      let contains = true;
      for (const w of words) if (!ow.includes(w)) { contains = false; break; }
      if (contains) { best = other; bestLen = ow.length; }
    }
    canonicalKey.set(k, best);
  }

  return (raw: string | null | undefined) => {
    const disp = normSeller(raw);
    if (disp === SEM_VENDEDOR) return SEM_VENDEDOR;
    const k = key(disp);
    if (SELLER_ALIASES[k]) return SELLER_ALIASES[k]; // apelido explícito
    const canonK = canonicalKey.get(k) ?? k;
    const canonDisp = displayByKey.get(canonK) ?? disp;
    return SELLER_ALIASES[key(canonDisp)] ?? canonDisp;
  };
}

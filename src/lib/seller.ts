// Normalização de nomes de vendedor. O nome vem como texto livre do Tiny, então
// o MESMO vendedor aparece com variações (espaços/maiúsculas) ou com o nome
// parcial vs completo ("Amanda de Castilhos" x "Amanda de Castilhos Angioletti").
// Sem tratamento, o dashboard conta o vendedor duas vezes.

export const SEM_VENDEDOR = "Sem vendedor";

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
    // Procura o nome MAIS LONGO do qual `k` é prefixo de palavras.
    let best = k;
    let bestLen = words.length;
    for (const other of keys) {
      if (other === k) continue;
      const ow = other.split(" ");
      if (ow.length <= bestLen) continue;
      let isPrefix = true;
      for (let i = 0; i < words.length; i++) if (ow[i] !== words[i]) { isPrefix = false; break; }
      if (isPrefix) { best = other; bestLen = ow.length; }
    }
    canonicalKey.set(k, best);
  }

  return (raw: string | null | undefined) => {
    const disp = normSeller(raw);
    if (disp === SEM_VENDEDOR) return SEM_VENDEDOR;
    const k = key(disp);
    const canonK = canonicalKey.get(k) ?? k;
    return displayByKey.get(canonK) ?? disp;
  };
}

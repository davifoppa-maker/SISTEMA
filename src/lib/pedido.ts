// Helpers de status de pedido.

function normNome(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Clientes INTERNOS a excluir das análises (contas próprias / transferências).
// Comparação por "contém". Vazio = ninguém excluído (Exx Nutrition volta a
// contar no faturamento, para bater com o Olist).
const CLIENTES_IGNORADOS: string[] = [];

export function clienteIgnorado(nome: string | null | undefined): boolean {
  const n = normNome(nome);
  if (!n) return false;
  return CLIENTES_IGNORADOS.some((c) => n.includes(c));
}

// Clientes cujos pedidos CONTAM no faturamento, mas ficam FORA do cálculo de
// margem (transferências internas com custo cadastrado distorcido, que jogariam
// a margem pra -278% etc.). Comparação por "contém".
const CLIENTES_FORA_DA_MARGEM = ["exx nutrition"];

// Vendedores cujos pedidos FICAM FORA da base de margem do Dashboard Comercial
// (faturamento conta normal; margem não é calculada — custo/condição distorcidos).
const VENDEDORES_FORA_MARGEM = ["luiz eduardo galdino"];
export function vendedorForaDaMargem(nome: string | null | undefined): boolean {
  const n = normNome(nome);
  return !!n && VENDEDORES_FORA_MARGEM.some((v) => n.includes(v));
}

export function clienteForaDaMargem(nome: string | null | undefined): boolean {
  const n = normNome(nome);
  if (!n) return false;
  return CLIENTES_FORA_DA_MARGEM.some((c) => n.includes(c));
}

// MARGEM FIXA por vendedor/cliente (exceções). Quando o custo real está
// distorcido e joga a margem pra valores absurdos, forçamos uma margem fixa nesses
// pedidos (custo = receita × (1 − pct/100)), sem tirá-los do faturamento.
// Comparação por "contém" no nome normalizado.
const MARGEM_FIXA: { match: string; pct: number }[] = [
  { match: "murilo oliveira barbosa", pct: 5 },
];

export function margemFixaPct(nome: string | null | undefined): number | null {
  const n = normNome(nome);
  if (!n) return null;
  const hit = MARGEM_FIXA.find((m) => n.includes(m.match));
  return hit ? hit.pct : null;
}

// Produtos que NÃO são bonificação, mesmo entrando com valor 0 (ex.: notas de
// transporte / remessa de insumo). Comparação por "contém" no nome normalizado.
const NAO_BONIFICADOS = ["creatina granel"];

export function produtoNaoBonificado(nome: string | null | undefined): boolean {
  const n = normNome(nome);
  if (!n) return false;
  return NAO_BONIFICADOS.some((p) => n.includes(p));
}

// Pedidos EXCLUÍDOS das análises por número (ex.: transferência interna com custo
// distorcido). Não some do banco (o cron reimporta do Olist), some das telas.
const PEDIDOS_IGNORADOS = new Set<string>([
  "175",
  "325", // BENI INDUSTRIA E COMERCIO LTDA (13/08/2026) — fora do faturamento
]);

export function pedidoNumIgnorado(orderNumber: string | null | undefined): boolean {
  const n = String(orderNumber ?? "").trim();
  return n !== "" && PEDIDOS_IGNORADOS.has(n);
}

// Pedido CANCELADO no Olist/Tiny. O status vem como texto ("cancelada") ou
// como código V3 (2 = cancelada). Não deve contar em faturamento/margem.
export function ehCancelado(tinyStatus: string | null | undefined): boolean {
  const s = String(tinyStatus ?? "").trim().toLowerCase();
  if (!s) return false;
  return s === "2" || s.includes("cancel");
}

// ————————————————————————————————————————————————————————————————
// CLASSIFICAÇÃO DA BONIFICAÇÃO pela natureza de operação do Olist.
// Padrão adotado (ago/2026):
//   • Bonificação influencer (dentro/fora do estado)            → Influencer
//   • Bonificação nutri/med (dentro/fora do estado)             → Nutri/Med
//   • Remessa em bonificação, doação ou brinde (dentro/fora)    → Lojista
export type CategoriaBonificacao = "influencer" | "nutri_med" | "lojista" | "outro";

export interface ClassificacaoBonificacao {
  categoria: CategoriaBonificacao;
  /** Rótulo pronto para exibição. */
  label: string;
  /** "dentro" | "fora" do estado, quando a natureza informa. */
  escopo: "dentro" | "fora" | null;
}

const LABEL_CATEGORIA: Record<CategoriaBonificacao, string> = {
  influencer: "Influencer",
  nutri_med: "Nutri/Med",
  lojista: "Lojista",
  outro: "Outro",
};

export function classificaBonificacao(natOperacao: string | null | undefined): ClassificacaoBonificacao {
  const n = normNome(natOperacao);

  let categoria: CategoriaBonificacao = "outro";
  if (n.includes("influ")) categoria = "influencer";
  else if (n.includes("nutri") || n.includes("med")) categoria = "nutri_med";
  else if (n.includes("remessa") || n.includes("doacao") || n.includes("brinde") || n.includes("lojista")) {
    categoria = "lojista";
  }

  // "dentro do estado" / "fora do estado" (aceita variações de escrita).
  let escopo: "dentro" | "fora" | null = null;
  if (n.includes("dentro")) escopo = "dentro";
  else if (n.includes("fora")) escopo = "fora";

  return { categoria, label: LABEL_CATEGORIA[categoria], escopo };
}

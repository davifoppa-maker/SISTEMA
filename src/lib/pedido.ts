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

// Pedidos EXCLUÍDOS das análises por número (ex.: transferência interna com custo
// distorcido). Não some do banco (o cron reimporta do Olist), some das telas.
const PEDIDOS_IGNORADOS = new Set<string>(["175"]);

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

/**
 * Leitura ao vivo do estoque a partir da planilha do Google Drive
 * "BALANCO ESTOQUE" (Nyer). A planilha tem duas abas:
 *   - "matéria prima"   → insumos em KG (aromas, WPC, albumina, malto, etc.)
 *   - "produto acabado" → produtos em unidades (3 tabelas lado a lado:
 *                          NYER, LAB SKULL e refis/embalagens/rótulos NYER).
 *
 * Os dados na planilha são "soltos" (unidades misturadas com os números, ex.
 * "45KG", "90,00", "160 kg"; várias tabelas na mesma aba). Este serviço lê o
 * CSV público de cada aba, normaliza tudo e devolve um relatório estruturado.
 *
 * Leitura sem credencial: usa o endpoint público de export do Google Sheets,
 * então a planilha precisa estar como "Qualquer pessoa com o link pode ver".
 */

import { CATALOG } from "@/lib/product-costs";

export const ESTOQUE_SHEET_ID =
  process.env.ESTOQUE_SHEET_ID || "1Q3PaZbBrCmq_MeXGdnnIOVf3JmwJXrqpAUx92qNWNto";

const TAB_MATERIA = process.env.ESTOQUE_TAB_MATERIA || "matéria prima";
const TAB_PRODUTO = process.env.ESTOQUE_TAB_PRODUTO || "produto acabado";
// Aba opcional com custos editáveis (colunas NOME, CUSTO). Se existir, os custos
// digitados lá têm prioridade sobre os custos derivados do catálogo do sistema.
const TAB_CUSTOS = process.env.ESTOQUE_TAB_CUSTOS || "custos";

export type Categoria = "materia_prima" | "produto_acabado";
export type Marca = "NYER" | "LAB SKULL";
export type CustoFonte = "planilha" | "catalogo";

export interface EstoqueItem {
  nome: string;
  quantidade: number;
  unidade: "un" | "kg";
  grupo: string;
  categoria: Categoria;
  marca?: Marca;
  custoUnit?: number;
  custoFonte?: CustoFonte;
  valor?: number;
  rawQtd: string;
}

export interface EstoqueReport {
  itens: EstoqueItem[];
  fetchedAt: string;
  sheetUrl: string;
  custosTab: string;
  resumo: {
    totalItens: number;
    produtoAcabadoUnidades: number;
    materiaPrimaKg: number;
    itensZerados: number;
    valorEstimado: number;
    itensComCusto: number;
    itensSemCusto: number;
  };
  grupos: { grupo: string; categoria: Categoria; itens: EstoqueItem[]; totalQtd: number }[];
}

export class EstoqueIndisponivelError extends Error {}

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${ESTOQUE_SHEET_ID}/edit`;

function csvUrl(tab: string): string {
  return `https://docs.google.com/spreadsheets/d/${ESTOQUE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

async function fetchTab(tab: string): Promise<string[][]> {
  let res: Response;
  try {
    res = await fetch(csvUrl(tab), { cache: "no-store" });
  } catch (e) {
    throw new EstoqueIndisponivelError(
      `Não foi possível acessar a planilha de estoque (${(e as Error).message}).`,
    );
  }
  if (!res.ok) {
    throw new EstoqueIndisponivelError(
      `A planilha respondeu com erro ${res.status}. Confirme se ela está compartilhada como "Qualquer pessoa com o link pode ver".`,
    );
  }
  const text = await res.text();
  // Quando a planilha é privada, o Google devolve uma página HTML de login em vez de CSV.
  if (/^\s*</.test(text) || /<html/i.test(text.slice(0, 200))) {
    throw new EstoqueIndisponivelError(
      'A planilha não está pública. Abra a planilha → Compartilhar → "Qualquer pessoa com o link" como Leitor.',
    );
  }
  return parseCSV(text);
}

/** Lê uma aba opcional; devolve [] se a aba não existir ou der qualquer erro. */
async function fetchTabOptional(tab: string): Promise<string[][]> {
  try {
    return await fetchTab(tab);
  } catch {
    return [];
  }
}

/** Parser de CSV (RFC 4180): respeita aspas e vírgulas dentro de células. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** Converte "45KG", "90,00", "7,5KG", "2.300", "160 kg" → número. */
function parseQtd(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/kg/gi, "").replace(/un\b/gi, "").replace(/\s+/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Custos: estima o valor do estoque (a vista de custo) cruzando os nomes da
// planilha com regras derivadas do catálogo de custos do sistema.
// Só os produtos acabados vendáveis recebem custo; refis/embalagens/rótulos e
// itens LAB SKULL ficam sem custo (não temos esse dado) e são listados à parte.
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogCost(re: RegExp): number {
  const found = CATALOG.find((p) => re.test(norm(p.name)));
  return found?.cost ?? 0;
}

const COST_RULES: { re: RegExp; cost: number }[] = [
  { re: /whey nyer refil 900g/, cost: catalogCost(/whey refill 900g/) || 55 },
  { re: /whey nyer refil 420g/, cost: catalogCost(/whey refill 420g/) || 26 },
  { re: /whey nyer refil 1kg/, cost: catalogCost(/whey refill 1kg/) || 57.9 },
  { re: /1kg pote/, cost: catalogCost(/whey gourmet 1kg/) || 62 },
  { re: /pure ?bust/, cost: catalogCost(/purebust/) || 21.48 },
  { re: /dark ?pump/, cost: catalogCost(/darkpump/) || 23.48 },
  { re: /^diuretico/, cost: catalogCost(/diuretico/) || 23 },
  { re: /creatina 500 refil/, cost: catalogCost(/creatina refill 500g/) || 30 },
  { re: /creatina 300 refil/, cost: catalogCost(/creatina refill 300g/) || 13.9 },
  { re: /creatina 300 pote/, cost: catalogCost(/creatina pote 300g/) || 13.9 },
  { re: /creatina 150 refil/, cost: catalogCost(/creatina refill 150g/) || 9.9 },
  { re: /^termogenico/, cost: catalogCost(/termogenico/) || 18.15 },
  { re: /^multivitaminico/, cost: catalogCost(/multivitaminico/) || 18.15 },
  { re: /hidro (original|maltado|chocolate|morango) 820/, cost: catalogCost(/hydro protein 820g/) || 48 },
  { re: /^magnesio/, cost: catalogCost(/magnesio/) || 23 },
];

/** Custos digitados pela usuária na aba "custos": norm(nome) → custo. */
export type CustoOverrides = Map<string, number>;

/** Converte "R$ 55,00", "55.9", "57,90" → número. */
function parseDinheiro(raw: string | undefined): number | null {
  if (raw == null) return null;
  let s = raw.replace(/r\$/gi, "").replace(/\s+/g, "").trim();
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Lê a aba "custos" (NOME, CUSTO) e devolve o mapa de overrides. */
function parseCustosTab(rows: string[][]): CustoOverrides {
  const map: CustoOverrides = new Map();
  for (const row of rows) {
    const nome = (row[0] ?? "").trim();
    if (!nome || /^(nome|produto|item)$/i.test(nome)) continue;
    const custo = parseDinheiro(row[1]);
    if (custo == null) continue;
    map.set(norm(nome), custo);
  }
  return map;
}

/**
 * Resolve o custo de um item: primeiro a aba "custos" (editável pela usuária),
 * depois as regras derivadas do catálogo do sistema (só para produtos NYER).
 */
function custoDe(
  nome: string,
  overrides: CustoOverrides,
  usarCatalogo: boolean,
): { custo: number; fonte: CustoFonte } | undefined {
  const n = norm(nome);
  const override = overrides.get(n);
  if (override != null) return { custo: override, fonte: "planilha" };
  if (usarCatalogo) {
    const rule = COST_RULES.find((r) => r.re.test(n));
    if (rule) return { custo: rule.cost, fonte: "catalogo" };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Parsing das abas
// ---------------------------------------------------------------------------

function isHeaderName(name: string): boolean {
  const n = name.trim();
  if (n.length <= 1) return true;
  if (/^\d+$/.test(n)) return true;
  return false;
}

/** Aba "matéria prima": pares (NOME, QNT) com seções (AROMA, MATERIA 2/3/4). */
function parseMateriaPrima(rows: string[][]): EstoqueItem[] {
  const itens: EstoqueItem[] = [];
  // Determina quantas colunas existem (em pares de 2: nome + quantidade)
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const numGroups = Math.ceil(maxCols / 2);

  // Um grupo por par de colunas (col 0,1 / 2,3 / 4,5 ...)
  const grupos: string[] = Array(numGroups).fill("Matéria-prima");
  const visto = new Set<string>(); // evita duplicatas entre colunas

  for (const row of rows) {
    for (let g = 0; g < numGroups; g++) {
      const nameCol = g * 2;
      const qtdCol = g * 2 + 1;
      const name = (row[nameCol] ?? "").trim();
      const rawQtd = (row[qtdCol] ?? "").trim();
      if (!name) continue;
      if (/^(nome|kg|quantidade)$/i.test(name)) continue;
      const qtd = parseQtd(rawQtd);
      if (qtd == null) {
        // Linha de seção (ex: "AROMA", "MATERIA 2")
        if (!isHeaderName(name)) grupos[g] = name.replace(/\s+/g, " ");
        continue;
      }
      const nome = name.replace(/\s+/g, " ");
      const key = `${g}:${nome}`;
      if (visto.has(key)) continue;
      visto.add(key);
      itens.push({
        nome,
        quantidade: qtd,
        unidade: "kg",
        grupo: grupos[g],
        categoria: "materia_prima",
        rawQtd,
      });
    }
  }
  return itens;
}

/**
 * Aba "produto acabado": duas tabelas lado a lado.
 * Layout real confirmado da planilha:
 *   cols 0,1 → NYER produtos acabados (tabela principal)
 *   cols 2,3 → tabela secundária: LAB SKULL, EMBALAGEM, NYER REFIS
 *              as seções são separadas por cabeçalhos em col 2 (ex: "LABSKULL", "NYER", "EMBALAGEM")
 */
function parseProdutoAcabado(rows: string[][], overrides: CustoOverrides): EstoqueItem[] {
  const itens: EstoqueItem[] = [];

  // Palavras que indicam cabeçalhos de linha (não são itens)
  const isRowHeader = (s: string) =>
    /^(nome|labskull|nyer|un|quantidade|embalagens?|kg|item)$/i.test(s.trim());

  // --- Tabela principal: cols 0,1 → NYER produtos acabados ---
  // Col 0 pode conter itens LAB SKULL, rótulos e refis de embalagem misturados.
  // Classifica pelo nome para separar os grupos.
  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const rawQtd = (row[1] ?? "").trim();
    if (!name || isRowHeader(name) || isHeaderName(name)) continue;
    const qtd = parseQtd(rawQtd);
    if (qtd == null) continue;
    const nome = name.replace(/\s+/g, " ");
    const upper = nome.toUpperCase();

    let grupo: string;
    let marca: Marca;
    if (upper.includes("LAB SKULL")) {
      grupo = "LAB SKULL";
      marca = "LAB SKULL";
    } else if (/^ROTULO/i.test(upper)) {
      grupo = "Rótulos NYER";
      marca = "NYER";
    } else if (/^REFIL\b/i.test(upper)) {
      grupo = "Embalagens / Refis";
      marca = "NYER";
    } else {
      grupo = "Produto acabado NYER";
      marca = "NYER";
    }

    const isNyer = marca === "NYER" && grupo === "Produto acabado NYER";
    const c = custoDe(nome, overrides, isNyer);
    itens.push({
      nome,
      quantidade: qtd,
      unidade: "un",
      grupo,
      categoria: "produto_acabado",
      marca,
      custoUnit: c?.custo,
      custoFonte: c?.fonte,
      valor: c != null ? c.custo * qtd : undefined,
      rawQtd,
    });
  }

  // --- Tabela secundária: cols 2,3 no CSV (col C vazia é pulada pelo gviz) ---
  // Col D da planilha = índice 2 no CSV. Cabeçalhos de seção: LABSKULL e NYER.
  let grupoSecundario = "LAB SKULL";
  for (const row of rows) {
    const name = (row[2] ?? "").trim();
    const rawQtd = (row[3] ?? "").trim();
    if (!name) continue;
    const upper = name.toUpperCase().replace(/\s+/g, " ");
    const qtd = parseQtd(rawQtd);
    if (qtd == null) {
      // Detecta cabeçalhos de seção antes de qualquer outro filtro
      if (upper === "LABSKULL" || upper === "LAB SKULL") { grupoSecundario = "LAB SKULL"; }
      else if (upper === "NYER") { grupoSecundario = "NYER – Embalagens / Refis"; }
      continue;
    }
    // Ignora linhas de cabeçalho com texto mas sem quantidade real
    if (/^(nome|un|quantidade|embalagens?)$/i.test(name)) continue;
    const nome = name.replace(/\s+/g, " ");
    const isNyer = grupoSecundario.toUpperCase().includes("NYER");
    const c = custoDe(nome, overrides, isNyer);
    itens.push({
      nome,
      quantidade: qtd,
      unidade: "un",
      grupo: grupoSecundario,
      categoria: "produto_acabado",
      marca: grupoSecundario === "LAB SKULL" ? "LAB SKULL" : "NYER",
      custoUnit: c?.custo,
      custoFonte: c?.fonte,
      valor: c != null ? c.custo * qtd : undefined,
      rawQtd,
    });
  }

  return itens;
}

function montarRelatorio(itens: EstoqueItem[]): EstoqueReport {
  const produtos = itens.filter((i) => i.categoria === "produto_acabado");
  const materias = itens.filter((i) => i.categoria === "materia_prima");

  const valorEstimado = produtos.reduce((s, i) => s + (i.valor ?? 0), 0);
  const itensComCusto = produtos.filter((i) => i.valor != null).length;

  // Agrupa preservando a ordem em que os grupos apareceram.
  const ordem: string[] = [];
  const mapa = new Map<string, EstoqueItem[]>();
  for (const i of itens) {
    const key = `${i.categoria}::${i.grupo}`;
    if (!mapa.has(key)) {
      mapa.set(key, []);
      ordem.push(key);
    }
    mapa.get(key)!.push(i);
  }
  const grupos = ordem.map((key) => {
    const lista = mapa.get(key)!;
    return {
      grupo: lista[0].grupo,
      categoria: lista[0].categoria,
      itens: lista,
      totalQtd: lista.reduce((s, i) => s + i.quantidade, 0),
    };
  });

  return {
    itens,
    fetchedAt: new Date().toISOString(),
    sheetUrl: SHEET_URL,
    custosTab: TAB_CUSTOS,
    resumo: {
      totalItens: itens.length,
      produtoAcabadoUnidades: produtos.reduce((s, i) => s + i.quantidade, 0),
      materiaPrimaKg: materias.reduce((s, i) => s + i.quantidade, 0),
      itensZerados: itens.filter((i) => i.quantidade === 0).length,
      valorEstimado,
      itensComCusto,
      itensSemCusto: produtos.length - itensComCusto,
    },
    grupos,
  };
}

/** Lê a planilha ao vivo e devolve o relatório estruturado. */
export async function getEstoqueReport(): Promise<EstoqueReport> {
  const [materiaRows, produtoRows, custosRows] = await Promise.all([
    fetchTab(TAB_MATERIA),
    fetchTab(TAB_PRODUTO),
    fetchTabOptional(TAB_CUSTOS),
  ]);
  const overrides = parseCustosTab(custosRows);
  const itens = [
    ...parseProdutoAcabado(produtoRows, overrides),
    ...parseMateriaPrima(materiaRows),
  ];
  if (itens.length === 0) {
    throw new EstoqueIndisponivelError(
      "A planilha foi lida, mas nenhum item foi reconhecido. As abas mudaram de nome ou de formato?",
    );
  }
  return montarRelatorio(itens);
}

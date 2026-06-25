/**
 * Leitura ao vivo do estoque a partir da planilha do Google Drive
 * "BALANCO ESTOQUE" (Nyer). A planilha tem três abas:
 *   - "matéria prima"   → insumos em KG (col A = nome, col B = quantidade)
 *   - "produto acabado" → produtos NYER em unidades (col A = nome, col B = quantidade)
 *   - "EMBALAGENS"      → LAB SKULL, embalagens, refis, rótulos (col A = nome, col B = quantidade)
 *
 * Leitura sem credencial: usa o endpoint público de export do Google Sheets,
 * então a planilha precisa estar como "Qualquer pessoa com o link pode ver".
 */

import { CATALOG } from "@/lib/product-costs";

export const ESTOQUE_SHEET_ID =
  process.env.ESTOQUE_SHEET_ID || "1Q3PaZbBrCmq_MeXGdnnIOVf3JmwJXrqpAUx92qNWNto";

// GIDs fixos das abas (mais confiável que o nome: gviz retorna a aba 0 silenciosamente
// quando o nome não é encontrado, mas gid= sempre localiza a aba correta).
const GID_MATERIA   = process.env.ESTOQUE_GID_MATERIA   || "1972969779";
const GID_PRODUTO   = process.env.ESTOQUE_GID_PRODUTO   || "0";
const GID_EMBALAGENS = process.env.ESTOQUE_GID_EMBALAGENS || "1514759055";
// Aba de custos ainda por nome (opcional, sem GID fixo).
const TAB_CUSTOS = process.env.ESTOQUE_TAB_CUSTOS || "custos";

export type Categoria = "materia_prima" | "produto_acabado" | "embalagens";
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
    embalagemItens: number;
    itensZerados: number;
    valorEstimado: number;
    itensComCusto: number;
    itensSemCusto: number;
  };
  grupos: { grupo: string; categoria: Categoria; itens: EstoqueItem[]; totalQtd: number }[];
}

export class EstoqueIndisponivelError extends Error {}

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${ESTOQUE_SHEET_ID}/edit`;

function csvUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${ESTOQUE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function csvUrlByName(tab: string): string {
  return `https://docs.google.com/spreadsheets/d/${ESTOQUE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
}

async function fetchTab(url: string): Promise<string[][]> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
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
async function fetchTabOptional(url: string): Promise<string[][]> {
  try {
    return await fetchTab(url);
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
// Custos: mapa exato nome→custo para todos os itens (produto acabado,
// embalagens e matéria-prima). Fonte: catálogo fornecido pela usuária.
// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const COST_MAP: Record<string, number> = (() => {
  const raw: [string, number][] = [
    // Produto acabado NYER
    ["WHEY NYER REFIL 900g CHOCOLATE", 90],
    ["WHEY NYER REFIL 900g MORANGO", 90],
    ["WHEY NYER REFIL 900g LEITINHO", 90],
    ["WHEY NYER REFIL 420g CHOCOLATE", 39.9],
    ["WHEY NYER REFIL 420g MORANGO", 39.9],
    ["WHEY NYER REFIL 420g LEITINHO", 39.9],
    ["WHEY NYER REFIL 1Kg CHOCOLATE", 95],
    ["WHEY NYER REFIL 1Kg MORANGO", 95],
    ["WHEY NYER REFIL 1Kg DOCE DE LEITE", 95],
    ["WHEY NYER REFIL 1Kg COOKIES", 95],
    ["WHEY NYER REFIL 1Kg BAUNILHA", 95],
    ["LEITINHO 1KG POTE", 95],
    ["MORANGO 1KG POTE", 95],
    ["CHOCOLATE 1KG POTE", 95],
    ["MARACUJA 1KG POTE", 95],
    ["AÇAÍ 1KG POTE", 95],
    ["CHOCOLATE MALTADO 1KG POTE", 95],
    ["PURE BUST LIMAO", 35],
    ["PURE BUST RED", 35],
    ["PURE BUST UVA", 35],
    ["DARK PUMP LIMAO", 39.9],
    ["DARK PUMP UVA", 39.9],
    ["DARK PUMP RED", 39.9],
    ["DIURETICO", 35],
    ["CREATINA 500 REFIL", 39.9],
    ["CREATINA 300 REFIL", 25],
    ["CREATINA 300 POTE", 25],
    ["CREATINA 150 REFIL", 15],
    ["TERMOGENICO", 29.9],
    ["MULTIVITAMINICO", 29.9],
    ["HYDRO ORIGINAL 820", 55],
    ["HYDRO MALTADO 820", 55],
    ["HYDRO CHOCOLATE 820", 55],
    ["HYDRO MORANGO 820", 55],
    ["CREATINA SLEEVE", 30],
    ["MAGNESIO", 45],
    // Embalagens LAB SKULL
    ["REFIL LAB SKULL 420G MORANGO", 2],
    ["REFIL LAB SKULL 420G CHOCOLATE", 2],
    ["REFIL LAB SKULL 420G COOKIES", 2],
    ["REFIL LAB SKULL 420G LEITINHO", 2],
    ["REFIL LAB SKULL 420G DOCE DE LEITE", 2],
    ["REFIL LAB SKULL 900G COOKIES", 2],
    ["REFIL LAB SKULL 900G CHOCOLATE", 2],
    ["REFIL LAB SKULL 900G DOCE DE LEITE", 2],
    ["REFIL LAB SKULL 900G LEITINHO", 2],
    ["REFIL LAB SKULL 900G MORANGO", 2],
    ["REFIL PRE TREINO LAB 150G RED", 2],
    ["REFIL PRE TREINO LAB 150G UVA", 2],
    ["REFIL PRE TREINO LAB 150G LIMAO", 2],
    ["REFIL PRE TREINO LAB 420G MORANGO", 2],
    ["REFIL PRE TREINO LAB 420G UVA", 2],
    ["REFIL PRE TREINO LAB 420 LIMAO", 2],
    ["CREATINA LAB SKULL 420", 2],
    // Embalagens NYER
    ["EMBALAGEM HIDRO MORANGO", 2],
    ["EMBALAGEM HIDRO CHOCOLATE", 2],
    ["EMBALAGEM HIDRO LEITINHO", 2],
    ["EMBALAGEM HIDRO MALTADO", 2],
    ["REFIL 900 NYER MORANGO", 2],
    ["REFIL 900 NYER LEITINHO", 2],
    ["REFIL 900 NYER CHOCOLATE", 2],
    ["REFIL 1KG NYER COOKIES", 2],
    ["REFIL 1KG NYER DOCE DE LEITE", 2],
    ["REFIL 1KG NYER CHOCOLATE", 2],
    ["REFIL 1KG NYER MORANGO", 2],
    ["REFIL 1KG NYER BAUNILHA", 2],
    ["REFIL 420 NYER ANTIGO LEITINHO", 2],
    ["REFIL 900 NYER ANTIGO MORANGO", 2],
    ["REFIL 900 NYER ANTIGO LEITINHO", 2],
    ["REFIL 900 NYER ANTIGO CHOCOLATE", 2],
    ["REFIL 500G CREATINA", 2],
    ["REFIL 150G CREATINA", 2],
    ["REFIL 300G CREATINA", 2],
    ["REFIL CREATINA 500", 2],
    ["ROTULO SLEEVE NYER AÇAÍ", 2],
    ["ROTULO SLEEVE NYER MALTADO", 2],
    ["ROTULO SLEEVE NYER LEITE", 2],
    ["ROTULO SLEEVE NYER MORANGO", 2],
    ["ROTULO SLEEVE NYER MARACUJÁ", 2],
    ["ROTULO SLEEVE NYER CHOCOLATE", 2],
    // Matéria-prima
    ["AROMA CHOCOLATE", 69.9],
    ["AROMA LEITINHO", 69.9],
    ["AROMA DOCE DE LEITE", 69.9],
    ["AROMA BAUNILHA", 69.9],
    ["AROMA LIMÃO", 69.9],
    ["AROMA UVA", 69.9],
    ["AROMA MORANGO", 69.9],
    ["AROMA AÇAÍ", 69.9],
    ["AROMA MARACUJÁ", 69.9],
    ["AROMA CHOCOLATE MALTADO", 69.9],
    ["AROMA ABACAXI", 69.9],
    ["AROMA CAFÉ SOLUVEL EXX", 0],
    ["AROMA DOCE DE LEITE EXX", 0],
    ["AROMA MORANGO EXX", 0],
    ["GLICINA", 23],
    ["TAURINA", 23],
    ["WPC 80", 140],
    ["WPC 34", 20],
    ["WPC 60 EXX", 0],
    ["SUCRALOSE", 140],
    ["EMULS 511", 50],
    ["ACIDO CITRICO", 20],
    ["LECITIONA DE SOJA", 30],
    ["ARGININA", 28],
    ["ERVA", 40],
    ["CMC", 50],
    ["DIOXIDO", 27],
    ["MALTO", 7.5],
    ["CREAMY FEEL", 50],
    ["TFT BLOCK", 50],
    ["CACAU", 35],
    ["CREATINA GRANEL", 20],
    ["PREMIX PRÉ TREINO UVA", 27],
    ["PREMIX PRÉ TREINO RED FRUITS", 27],
    ["PREMIX PRÉ TREINO LIMÃO", 27],
  ];
  return Object.fromEntries(raw.map(([k, v]) => [norm(k), v]));
})();

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
 * Resolve o custo de um item: primeiro a aba "custos" (overrides da planilha),
 * depois o catálogo fixo do sistema (COST_MAP).
 */
function custoDe(
  nome: string,
  overrides: CustoOverrides,
): { custo: number; fonte: CustoFonte } | undefined {
  const n = norm(nome);
  const override = overrides.get(n);
  if (override != null) return { custo: override, fonte: "planilha" };
  const catalogoVal = COST_MAP[n];
  if (catalogoVal != null) return { custo: catalogoVal, fonte: "catalogo" };
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
function parseMateriaPrima(rows: string[][], overrides: CustoOverrides): EstoqueItem[] {
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
      const c = custoDe(nome, overrides);
      itens.push({
        nome,
        quantidade: qtd,
        unidade: "kg",
        grupo: grupos[g],
        categoria: "materia_prima",
        custoUnit: c?.custo,
        custoFonte: c?.fonte,
        valor: c != null ? c.custo * qtd : undefined,
        rawQtd,
      });
    }
  }
  return itens;
}

/**
 * Aba "produto acabado": duas tabelas lado a lado.
 * Aba "produto acabado": col A = nome, col B = quantidade (simples, só NYER).
 */
function parseProdutoAcabado(rows: string[][], overrides: CustoOverrides): EstoqueItem[] {
  const itens: EstoqueItem[] = [];
  let grupo = "Produto acabado NYER";
  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const rawQtd = (row[1] ?? "").trim();
    if (!name) continue;
    if (/^(nome|quantidade)$/i.test(name)) continue;
    const qtd = parseQtd(rawQtd);
    if (qtd == null) {
      if (!isHeaderName(name)) grupo = name.replace(/\s+/g, " ");
      continue;
    }
    const nome = name.replace(/\s+/g, " ");
    const c = custoDe(nome, overrides);
    itens.push({
      nome,
      quantidade: qtd,
      unidade: "un",
      grupo,
      categoria: "produto_acabado",
      marca: "NYER",
      custoUnit: c?.custo,
      custoFonte: c?.fonte,
      valor: c != null ? c.custo * qtd : undefined,
      rawQtd,
    });
  }
  return itens;
}

/**
 * Aba "EMBALAGENS": col A = nome, col B = quantidade.
 * Seções separadas por cabeçalhos (ex: "LABSKULL", "NYER", "EMBALAGEM HIDRO").
 */
function parseEmbalagens(rows: string[][], overrides: CustoOverrides): EstoqueItem[] {
  const itens: EstoqueItem[] = [];
  let grupo = "Embalagens";
  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const rawQtd = (row[1] ?? "").trim();
    if (!name) continue;
    if (/^(nome|quantidade|un)$/i.test(name)) continue;
    const qtd = parseQtd(rawQtd);
    if (qtd == null) {
      if (!isHeaderName(name)) grupo = name.replace(/\s+/g, " ");
      continue;
    }
    const nome = name.replace(/\s+/g, " ");
    const upper = nome.toUpperCase();
    const marca: Marca = upper.includes("LAB SKULL") || upper.includes("LAB ") ? "LAB SKULL" : "NYER";
    const c = custoDe(nome, overrides);
    itens.push({
      nome,
      quantidade: qtd,
      unidade: "un",
      grupo,
      categoria: "embalagens",
      marca,
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

  const valorEstimado = itens.reduce((s, i) => s + (i.valor ?? 0), 0);
  const itensComCusto = itens.filter((i) => i.custoUnit != null).length;
  const embalagens = itens.filter((i) => i.categoria === "embalagens");

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
      embalagemItens: embalagens.length,
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
  const [materiaRows, produtoRows, embalagemRows, custosRows] = await Promise.all([
    fetchTab(csvUrl(GID_MATERIA)),
    fetchTab(csvUrl(GID_PRODUTO)),
    fetchTabOptional(csvUrl(GID_EMBALAGENS)),
    fetchTabOptional(csvUrlByName(TAB_CUSTOS)),
  ]);

  const overrides = parseCustosTab(custosRows);
  const itens = [
    ...parseProdutoAcabado(produtoRows, overrides),
    ...parseEmbalagens(embalagemRows, overrides),
    ...parseMateriaPrima(materiaRows, overrides),
  ];
  if (itens.length === 0) {
    throw new EstoqueIndisponivelError(
      "A planilha foi lida, mas nenhum item foi reconhecido. As abas mudaram de nome ou de formato?",
    );
  }
  return montarRelatorio(itens);
}

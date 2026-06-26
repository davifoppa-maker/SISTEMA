// Cubagem automática: a partir dos itens do pedido (SKU + quantidade), cruza com
// a tabela de medidas (PRODUCT_MEASURES) e empacota nas caixas padrão da expedição,
// escolhendo a combinação de menor volume total (proxy de custo: caixa menor = mais
// barata). Sem limite de peso por caixa (enche o que couber por espaço); o peso
// total da cotação vem do Tiny à parte.
//
// Empacotamento: heurístico First-Fit-Decreasing por volume + checagem dimensional
// (com rotação) e um fator de aproveitamento (não dá pra encher 100% a caixa).
// É uma aproximação — bom para potes/caixinhas de suplemento; afina-se o fator
// com casos reais.

import { PRODUCT_MEASURES } from "./data/product-measures";

export interface Caixa {
  nome: string;
  comprimentoCm: number;
  larguraCm: number;
  alturaCm: number;
}

// Medidas INTERNAS das caixas da expedição (C × L × A, cm).
export const CAIXAS: Caixa[] = [
  { nome: "Caixa 0", comprimentoCm: 18, larguraCm: 14, alturaCm: 7.5 },
  { nome: "Caixa 1", comprimentoCm: 23.5, larguraCm: 14, alturaCm: 12.5 },
  { nome: "Caixa 2", comprimentoCm: 26.5, larguraCm: 23.5, alturaCm: 13.5 },
  { nome: "Caixa 3", comprimentoCm: 26.5, larguraCm: 26.5, alturaCm: 26.5 },
  { nome: "Caixa 4", comprimentoCm: 44.5, larguraCm: 30, alturaCm: 25 },
  { nome: "Caixa 5", comprimentoCm: 50, larguraCm: 35, alturaCm: 30 },
];

// Quanto do volume da caixa dá pra ocupar de fato (espaços vazios entre itens).
export const FILL_FACTOR = 0.8;

interface Dim {
  comprimentoCm: number;
  larguraCm: number;
  alturaCm: number;
}

function volCm3(d: Dim): number {
  return d.comprimentoCm * d.larguraCm * d.alturaCm;
}

function dimsOrdenadas(d: Dim): number[] {
  return [d.comprimentoCm, d.larguraCm, d.alturaCm].sort((a, b) => b - a);
}

// O item cabe na caixa se, ordenando as 3 dimensões de cada um, todas couberem
// (permite girar o item).
function cabeDimensional(item: Dim, caixa: Dim): boolean {
  const i = dimsOrdenadas(item);
  const c = dimsOrdenadas(caixa);
  return i[0] <= c[0] && i[1] <= c[1] && i[2] <= c[2];
}

export interface ItemPedido {
  sku: string | null;
  descricao: string;
  quantidade: number;
}

export type StatusItem = "ok" | "sem_medida" | "digital";

export interface DetalheItem {
  sku: string | null;
  descricao: string;
  quantidade: number;
  volumeUnitCm3: number | null;
  status: StatusItem;
}

export interface CaixaEscolhida {
  caixa: Caixa;
  quantidade: number;
}

export interface LinhaCubagem {
  altura: string;
  largura: string;
  comprimento: string;
  volumes: string;
}

export interface CubagemResultado {
  /** Caixas escolhidas, agrupadas por modelo. */
  caixas: CaixaEscolhida[];
  /** Volume somado dos itens (sem o vazio das caixas). */
  volumeItensCm3: number;
  volumeItensM3: number;
  /** Detalhe item a item (inclui digitais e sem-medida). */
  detalheItens: DetalheItem[];
  /** SKUs que não estão na base (produto novo) — pedir cadastro da medida. */
  semMedida: { sku: string | null; descricao: string }[];
  /** Avisos (ex.: item maior que a maior caixa). */
  alertas: string[];
}

/** Calcula a cubagem e o empacotamento dos itens de um pedido. */
export function calcularCubagem(itens: ItemPedido[]): CubagemResultado {
  const detalheItens: DetalheItem[] = [];
  const semMedida: { sku: string | null; descricao: string }[] = [];
  const alertas: string[] = [];

  interface Unidade {
    sku: string | null;
    descricao: string;
    dim: Dim;
    vol: number;
  }
  const unidades: Unidade[] = [];

  for (const it of itens) {
    const qty = Math.max(0, Math.floor(Number(it.quantidade) || 0));
    const sku = it.sku ? String(it.sku).trim() : null;
    const medida = sku ? PRODUCT_MEASURES[sku] : undefined;

    if (!medida) {
      detalheItens.push({ sku, descricao: it.descricao, quantidade: qty, volumeUnitCm3: null, status: "sem_medida" });
      semMedida.push({ sku, descricao: it.descricao });
      continue;
    }

    const dim: Dim = {
      comprimentoCm: medida.comprimentoCm,
      larguraCm: medida.larguraCm,
      alturaCm: medida.alturaCm,
    };
    const v = volCm3(dim);

    if (v <= 0) {
      // medida zerada = produto digital (ebook) → não vai em caixa
      detalheItens.push({ sku, descricao: it.descricao, quantidade: qty, volumeUnitCm3: 0, status: "digital" });
      continue;
    }

    detalheItens.push({ sku, descricao: it.descricao, quantidade: qty, volumeUnitCm3: v, status: "ok" });
    for (let i = 0; i < qty; i++) unidades.push({ sku, descricao: it.descricao, dim, vol: v });
  }

  // Estratégia (combina com a operação): encher a MAIOR caixa primeiro — menos
  // caixas e caixas maiores — e, no fim, REDUZIR cada caixa para o menor modelo
  // que ainda comporta seu conteúdo. Assim a sobra vai numa única caixa menor
  // (ex.: "7× Caixa 4 + 1× Caixa 1"), em vez de várias caixinhas.
  unidades.sort((a, b) => b.vol - a.vol);

  interface Bin {
    caixa: Caixa;
    usados: number;
    itens: Dim[];
  }
  const maior = CAIXAS[CAIXAS.length - 1];
  const bins: Bin[] = [];
  let restantes = unidades.slice();

  while (restantes.length > 0) {
    const bin: Bin = { caixa: maior, usados: 0, itens: [] };
    const sobra: typeof restantes = [];
    for (const u of restantes) {
      if (cabeDimensional(u.dim, maior) && bin.usados + u.vol <= volCm3(maior) * FILL_FACTOR) {
        bin.itens.push(u.dim);
        bin.usados += u.vol;
      } else {
        sobra.push(u);
      }
    }
    // Nada coube (item não entra nem na maior caixa) → força um e alerta, p/ não travar.
    if (bin.itens.length === 0) {
      const u = sobra.shift()!;
      bin.itens.push(u.dim);
      bin.usados += u.vol;
      alertas.push(`Item "${u.descricao}" (SKU ${u.sku ?? "?"}) não cabe nem na ${maior.nome} — conferir manualmente.`);
    }
    bins.push(bin);
    restantes = sobra;
  }

  // Reduz cada caixa para o MENOR modelo que comporta (volume×fator + dimensional).
  for (const bin of bins) {
    const candidatos = CAIXAS.filter(
      (c) => bin.usados <= volCm3(c) * FILL_FACTOR && bin.itens.every((d) => cabeDimensional(d, c)),
    ).sort((a, b) => volCm3(a) - volCm3(b));
    if (candidatos.length > 0) bin.caixa = candidatos[0];
  }

  // agrupa as caixas por modelo
  const mapa = new Map<string, CaixaEscolhida>();
  for (const b of bins) {
    const e = mapa.get(b.caixa.nome);
    if (e) e.quantidade += 1;
    else mapa.set(b.caixa.nome, { caixa: b.caixa, quantidade: 1 });
  }
  const caixas = [...mapa.values()].sort((a, b) => volCm3(b.caixa) - volCm3(a.caixa));

  const volumeItensCm3 = unidades.reduce((s, u) => s + u.vol, 0);

  return {
    caixas,
    volumeItensCm3,
    volumeItensM3: Math.round((volumeItensCm3 / 1_000_000) * 1000) / 1000,
    detalheItens,
    semMedida,
    alertas,
  };
}

/** Converte o resultado em linhas de cubagem (dimensões em METROS) para a cotação. */
export function cubagemParaLinhas(res: CubagemResultado): LinhaCubagem[] {
  return res.caixas.map(({ caixa, quantidade }) => ({
    altura: String(caixa.alturaCm / 100),
    largura: String(caixa.larguraCm / 100),
    comprimento: String(caixa.comprimentoCm / 100),
    volumes: String(quantidade),
  }));
}

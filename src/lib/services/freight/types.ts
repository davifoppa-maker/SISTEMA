/**
 * Tipos genéricos da camada de transportadoras (freight).
 *
 * Cada transportadora (Braspress, Jadlog, Correios…) implementa `FreightProvider`.
 * As rotas e a UI falam só com essa interface — adicionar uma transportadora nova
 * é criar um provider e registrá-lo em `freight/registry.ts`, sem mexer no resto.
 */

/** Uma dimensão de volume: N caixas iguais (`volumes`) com altura×largura×comprimento (em metros). */
export interface CubagemItem {
  altura: number;
  largura: number;
  comprimento: number;
  volumes: number;
}

export interface QuoteParams {
  /** CNPJ/CPF do destinatário (com ou sem máscara). */
  cnpjDestinatario: string;
  /** CEP de destino (com ou sem máscara). */
  cepDestino: string;
  /** Valor da mercadoria (R$). */
  vlrMercadoria: number;
  /** Peso bruto total (kg). */
  peso: number;
  /** Total de volumes. */
  volumes: number;
  /** Detalhamento de cubagem por dimensão. */
  cubagem: CubagemItem[];
  /** Overrides opcionais do remetente / parâmetros. */
  cnpjRemetente?: string;
  cepOrigem?: string;
  /** Modal de transporte (ex.: "R" rodoviário | "A" aéreo) — interpretação por provider. */
  modal?: string;
  /** Tipo de frete (ex.: "1" CIF | "2" FOB) — interpretação por provider. */
  tipoFrete?: string;
  /** Empresa do pedido ("nyer" | "ecopro") — seleciona credenciais/remetente. */
  empresa?: string;
}

export interface QuoteResult {
  id?: number | string;
  /** Prazo de entrega em dias. */
  prazo?: number;
  /** Valor total do frete (R$). */
  totalFrete?: number;
  /** Validade da cotação. */
  validade?: string;
  /** Resposta crua do provider (diagnóstico). */
  raw?: unknown;
}

export type QuoteOutcome =
  | { ok: true; data: QuoteResult }
  | { ok: false; error: string; status?: number; detail?: unknown };

/** Um evento da timeline de rastreio. */
export interface TrackingEvent {
  data?: string;
  descricao?: string;
  local?: string;
}

/** Um conhecimento (carga) rastreado. */
export interface TrackingShipment {
  status?: string;
  numero?: string;
  origem?: string;
  destino?: string;
  previsaoEntrega?: string;
  dataEntrega?: string;
  ultimaOcorrencia?: string;
  /** Sinal normalizado de entrega concluída (cada provider decide pela ocorrência). */
  entregue?: boolean;
  timeline: TrackingEvent[];
}

export interface TrackingResult {
  shipments: TrackingShipment[];
  raw: unknown;
}

export type TrackingOutcome =
  | { ok: true; data: TrackingResult }
  | { ok: false; error: string; status?: number; detail?: unknown };

/** Contrato que toda transportadora implementa. */
export interface FreightProvider {
  /** Identificador usado na URL/registro (ex.: "braspress"). */
  id: string;
  /** Nome de exibição (ex.: "Braspress"). */
  label: string;
  /** Há credenciais configuradas para esta transportadora? */
  isConfigured(): boolean;
  /** Cota o frete. */
  quote(params: QuoteParams): Promise<QuoteOutcome>;
  /** Rastreia pela nota fiscal. */
  track(notaFiscal: string, cnpj?: string): Promise<TrackingOutcome>;
}

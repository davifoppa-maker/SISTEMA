/**
 * Tabela de fretes da LENOIR TRANSPORTES (transportadora regional do sul de SC,
 * SEM API). Preço FIXO por faixa de CEP de destino, prazo por cidade. O limite de
 * peso foi intencionalmente ignorado (a Lenoir leva acima da faixa da tabela).
 *
 * Fonte: tabela enviada pela transportadora (prints). Para atualizar, editar aqui.
 */

export interface LenoirFaixa {
  /** CEP inicial (8 dígitos, numérico). */
  ini: number;
  /** CEP final (8 dígitos, numérico). */
  fim: number;
  /** Valor fixo do frete (R$). */
  valor: number;
  /** Prazo de entrega (dias). */
  prazo: number;
  cidade: string;
}

// Ordenado por CEP inicial.
const FAIXAS: LenoirFaixa[] = [
  { cidade: "Tubarão", ini: 88700001, fim: 88709999, valor: 20, prazo: 3 },
  { cidade: "Treze de Maio", ini: 88710000, fim: 88714999, valor: 20, prazo: 3 },
  { cidade: "Jaguaruna", ini: 88715000, fim: 88716999, valor: 20, prazo: 3 },
  { cidade: "Sangão", ini: 88717000, fim: 88719999, valor: 20, prazo: 3 },
  { cidade: "Pedras Grandes", ini: 88720000, fim: 88729999, valor: 20, prazo: 3 },
  { cidade: "São Ludgero", ini: 88730000, fim: 88734999, valor: 20, prazo: 3 },
  { cidade: "Gravatal", ini: 88735000, fim: 88739999, valor: 20, prazo: 3 },
  { cidade: "Armazém", ini: 88740000, fim: 88744999, valor: 20, prazo: 3 },
  { cidade: "Capivari de Baixo", ini: 88745000, fim: 88749999, valor: 20, prazo: 3 },
  { cidade: "Braço do Norte", ini: 88750000, fim: 88759999, valor: 20, prazo: 2 },
  { cidade: "Rio Fortuna", ini: 88760000, fim: 88762999, valor: 20, prazo: 3 },
  { cidade: "São Martinho", ini: 88765000, fim: 88766970, valor: 20, prazo: 3 },
  { cidade: "Imbituba", ini: 88780000, fim: 88789999, valor: 20, prazo: 3 },
  { cidade: "Laguna", ini: 88790000, fim: 88797999, valor: 20, prazo: 3 },
  { cidade: "Pescaria Brava", ini: 88798000, fim: 88799999, valor: 20, prazo: 3 },
  { cidade: "Criciúma", ini: 88800001, fim: 88819999, valor: 20, prazo: 3 },
  { cidade: "Içara", ini: 88820000, fim: 88827999, valor: 20, prazo: 3 },
  { cidade: "Balneário Rincão", ini: 88828000, fim: 88829999, valor: 20, prazo: 3 },
  { cidade: "Morro da Fumaça", ini: 88830000, fim: 88839999, valor: 20, prazo: 3 },
  { cidade: "Urussanga", ini: 88840000, fim: 88844999, valor: 20, prazo: 3 },
  { cidade: "Cocal do Sul", ini: 88845000, fim: 88849999, valor: 20, prazo: 3 },
  { cidade: "Forquilhinha", ini: 88850000, fim: 88859999, valor: 20, prazo: 3 },
  { cidade: "Siderópolis", ini: 88860000, fim: 88860990, valor: 20, prazo: 3 },
  { cidade: "Nova Veneza", ini: 88865000, fim: 88869999, valor: 20, prazo: 3 },
  { cidade: "Orleans", ini: 88870000, fim: 88879999, valor: 20, prazo: 3 },
  { cidade: "Lauro Müller", ini: 88880000, fim: 88889999, valor: 20, prazo: 3 },
  { cidade: "Grão Pará", ini: 88890000, fim: 88899999, valor: 20, prazo: 3 },
  { cidade: "Araranguá", ini: 88900001, fim: 88912499, valor: 20, prazo: 3 },
  { cidade: "Araranguá (Balneário Ilhas)", ini: 88912500, fim: 88912536, valor: 20, prazo: 6 },
  { cidade: "Araranguá (2)", ini: 88912537, fim: 88913999, valor: 20, prazo: 3 },
  { cidade: "Balneário Arroio do Silva", ini: 88914000, fim: 88914999, valor: 20, prazo: 3 },
  { cidade: "Maracajá", ini: 88915000, fim: 88919999, valor: 20, prazo: 3 },
  { cidade: "Meleiro", ini: 88920000, fim: 88924999, valor: 20, prazo: 3 },
  { cidade: "Morro Grande", ini: 88925000, fim: 88929999, valor: 20, prazo: 3 },
  { cidade: "Turvo", ini: 88930000, fim: 88934999, valor: 20, prazo: 3 },
  { cidade: "Ermo", ini: 88935000, fim: 88939999, valor: 20, prazo: 3 },
  { cidade: "Timbé do Sul", ini: 88940000, fim: 88949999, valor: 20, prazo: 3 },
  { cidade: "Jacinto Machado", ini: 88950000, fim: 88954999, valor: 20, prazo: 3 },
  { cidade: "Balneário Gaivota", ini: 88955000, fim: 88959999, valor: 20, prazo: 3 },
  { cidade: "Sombrio", ini: 88960000, fim: 88964999, valor: 20, prazo: 3 },
  { cidade: "Santa Rosa do Sul", ini: 88965000, fim: 88969999, valor: 20, prazo: 3 },
  { cidade: "Passo de Torres", ini: 88980000, fim: 88989999, valor: 20, prazo: 3 },
  { cidade: "Praia Grande", ini: 88990000, fim: 88999999, valor: 20, prazo: 3 },
];

/** Procura a faixa da Lenoir que cobre o CEP de destino. null se ela não atende. */
export function lenoirFaixaForCep(cep: string | number): LenoirFaixa | null {
  const n = Number(String(cep).replace(/\D/g, ""));
  if (!n) return null;
  return FAIXAS.find((f) => n >= f.ini && n <= f.fim) ?? null;
}

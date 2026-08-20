// Detecção padronizada de "região não atendida" nas respostas das
// transportadoras. Cada API descreve isso de um jeito ("nenhum serviço
// encontrado", "praça não atendida", "percurso não localizado", "fora da
// abrangência"...) — aqui viram sempre a mesma resposta clara na cotação.

const PADROES_NAO_ATENDE =
  /n[ãa]o\s+atend|atendid[oa]?\s*[:=]?\s*n[ãa]o|abrang[eê]|pra[çc]a|percurso\s+n[ãa]o|percurso\s+inv|sem\s+cobertura|cobertura\s+indispon|fora\s+d[ea]\s+(rota|área|area|atua[çc][ãa]o)|localidade\s+n[ãa]o|rota\s+n[ãa]o|nenhum\s+servi[çc]o\s+encontrado|cep\s+n[ãa]o\s+(atendido|localizado)/i;

/** A mensagem da API indica que a rota/região não é atendida? */
export function pareceNaoAtende(msg: unknown): boolean {
  return PADROES_NAO_ATENDE.test(String(msg ?? ""));
}

/** Resposta padronizada exibida na cotação. */
export function msgNaoAtende(nomeTransportadora: string): string {
  return `A ${nomeTransportadora} não atende esta região.`;
}


// Faixas oficiais de CEP por UF (prefixo de 5 dígitos).
const FAIXAS_UF: [number, number, string][] = [
  [1000, 19999, "SP"], [20000, 28999, "RJ"], [29000, 29999, "ES"],
  [30000, 39999, "MG"], [40000, 48999, "BA"], [49000, 49999, "SE"],
  [50000, 56999, "PE"], [57000, 57999, "AL"], [58000, 58999, "PB"],
  [59000, 59999, "RN"], [60000, 63999, "CE"], [64000, 64999, "PI"],
  [65000, 65999, "MA"], [66000, 68899, "PA"], [68900, 68999, "AP"],
  [69000, 69299, "AM"], [69300, 69399, "RR"], [69400, 69899, "AM"],
  [69900, 69999, "AC"], [70000, 72799, "DF"], [72800, 72999, "GO"],
  [73000, 73699, "DF"], [73700, 76799, "GO"], [76800, 76999, "RO"],
  [77000, 77999, "TO"], [78000, 78899, "MT"], [78900, 78999, "RO"],
  [79000, 79999, "MS"], [80000, 87999, "PR"], [88000, 89999, "SC"],
  [90000, 99999, "RS"],
];

/** UF do CEP (pelas faixas oficiais). null se o CEP for inválido. */
export function ufDoCep(cep: string | null | undefined): string | null {
  const d = String(cep ?? "").replace(/\D/g, "");
  if (d.length < 5) return null;
  const prefixo = Number(d.slice(0, 5));
  for (const [ini, fim, uf] of FAIXAS_UF) {
    if (prefixo >= ini && prefixo <= fim) return uf;
  }
  return null;
}

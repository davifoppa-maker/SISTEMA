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

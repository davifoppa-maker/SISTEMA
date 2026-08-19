import { getTranslovatoConfig, isTranslovatoConfigured, quoteTranslovato } from "@/lib/services/freight/translovato";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico da Translovato (roda em PRODUÇÃO, que alcança o WS; o ambiente de
// dev bloqueia o domínio). Mostra config atual e testa uma cotação de exemplo.
//   GET /api/debug/translovato?k=exxdebug
//   opcional: &cep=89202000&valor=500&peso=5
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const c = getTranslovatoConfig();
  // Nunca expõe a senha; só indica se está preenchida.
  const configVisivel = {
    cnpj: c.cnpj || "(vazio)",
    usuario: c.usuario || "(vazio)",
    senha: c.senha ? "(preenchida)" : "(vazio)",
    cdEmpresa: c.cdEmpresa,
    cdNatureza: c.cdNatureza,
    cepOrigem: c.cepOrigem,
    cnpjRemetente: c.cnpjRemetente,
    wsUrl: c.wsUrl,
    configurada: isTranslovatoConfigured(),
  };

  const cep = u.searchParams.get("cep") || "89202000"; // Joinville (exemplo)
  const valor = Number(u.searchParams.get("valor") || 500);
  const peso = Number(u.searchParams.get("peso") || 5);

  const cotacao = await quoteTranslovato({
    cnpjDestinatario: "",
    cepDestino: cep,
    vlrMercadoria: valor,
    peso,
    volumes: 1,
    cubagem: [{ altura: 0.3, largura: 0.3, comprimento: 0.3, volumes: 1 }],
  });

  return Response.json({ ok: true, config: configVisivel, cotacaoTeste: cotacao });
}

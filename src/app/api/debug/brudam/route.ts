import { getBrudamConfig, getBrudamToken, quoteBrudam } from "@/lib/services/freight/brudam";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico Brudam/Multi (roda em PRODUÇÃO — o dev bloqueia o domínio).
//   GET /api/debug/brudam?k=exxdebug   (opcional: &cep=...&valor=...&peso=...)
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const c = getBrudamConfig();
  const configVisivel = {
    usuario: c.usuario ? "(preenchido)" : "(vazio)",
    senha: c.senha ? "(preenchida)" : "(vazio)",
    token: c.token ? "(preenchido)" : "(vazio)",
    apiBaseUrl: c.apiBaseUrl,
    cepOrigem: c.cepOrigem,
    cnpjRemetente: c.cnpjRemetente,
  };

  // Passo 1: login (só precisa de usuário/senha).
  const loginTeste = await getBrudamToken();

  // Passo 2: cotação de exemplo (só tenta se o login funcionou).
  const cep = u.searchParams.get("cep") || "01001000";
  const valor = Number(u.searchParams.get("valor") || 500);
  const peso = Number(u.searchParams.get("peso") || 5);
  const cotacaoTeste = loginTeste.ok
    ? await quoteBrudam({
        cnpjDestinatario: "",
        cepDestino: cep,
        vlrMercadoria: valor,
        peso,
        volumes: 1,
        cubagem: [{ altura: 0.3, largura: 0.3, comprimento: 0.3, volumes: 1 }],
      })
    : { ok: false, error: "Login falhou — corrija antes de testar a cotação." };

  // Não expõe o token real, só confirma que veio.
  const loginResumo = loginTeste.ok
    ? { ok: true, token: "(recebido)" }
    : loginTeste;

  // SONDA os caminhos candidatos de cotação (o /cotacoes deu 404). 404 = não
  // existe; 400/401/422 = existe mas faltou dado/permissão (é o que buscamos).
  let sondagem: Record<string, unknown> | null = null;
  if (loginTeste.ok && u.searchParams.get("probe") !== "0") {
    const token = (loginTeste as { token: string }).token;
    const candidatos = [
      "/cotacao", "/cotacoes", "/frete/cotacao", "/fretes/cotacao",
      "/frete/simulacao", "/simulacao", "/simulador", "/cotacao/simular",
      "/frete/simular", "/fretes/simular", "/coletas/cotacao", "/ctes/cotacao",
    ];
    const bodyTeste = JSON.stringify({ cep_origem: c.cepOrigem, cep_destino: cep, peso, valor_mercadoria: valor, volumes: 1 });
    const results: Record<string, number | string> = {};
    await Promise.all(candidatos.map(async (path) => {
      try {
        const r = await fetch(`${c.apiBaseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
          body: bodyTeste,
        });
        results[path] = r.status; // 404 = não existe; outro = candidato
      } catch (e) {
        results[path] = e instanceof Error ? e.message : "erro";
      }
    }));
    sondagem = results;
  }

  return Response.json({ ok: true, config: configVisivel, loginTeste: loginResumo, cotacaoTeste, sondagemCaminhos: sondagem });
}

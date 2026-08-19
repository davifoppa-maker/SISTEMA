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

  // DESCOBERTA REAL: a doc (multi.brudam.com.br/docs/#/) é um Swagger — baixa a
  // especificação JSON e lista os endpoints verdadeiros. Nada de chutar path.
  let especificacao: Record<string, unknown> | null = null;
  if (u.searchParams.get("spec") !== "0") {
    const host = c.apiBaseUrl.replace(/\/api\/v\d+$/, ""); // https://multi.brudam.com.br
    const candidatosSpec = [
      `${host}/docs/swagger.json`,
      `${host}/docs/openapi.json`,
      `${host}/docs/api-docs.json`,
      `${host}/docs/api-docs`,
      `${host}/swagger.json`,
      `${host}/openapi.json`,
      `${host}/api/v1/docs.json`,
      `${host}/api/docs.json`,
    ];
    const tentativasSpec: Record<string, number | string> = {};
    let spec: any = null;
    let specUrl = "";
    for (const url of candidatosSpec) {
      try {
        const r = await fetch(url, { headers: { Accept: "application/json" } });
        tentativasSpec[url] = r.status;
        if (!r.ok) continue;
        const j = await r.json().catch(() => null);
        if (j && (j.paths || j.swagger || j.openapi)) { spec = j; specUrl = url; break; }
      } catch (e) {
        tentativasSpec[url] = e instanceof Error ? e.message : "erro";
      }
    }
    // Plano B: o HTML da página /docs referencia o arquivo da spec — acha e baixa.
    if (!spec) {
      try {
        const r = await fetch(`${host}/docs/`, { headers: { Accept: "text/html" } });
        const html = await r.text();
        tentativasSpec[`${host}/docs/ (html)`] = r.status;
        const refs = [...html.matchAll(/["'\(]((?:https?:\/\/|\/)[^"'\)\s]*?(?:swagger|openapi|api-docs|docs)[^"'\)\s]*?\.(?:json|yaml))["'\)]/gi)]
          .map((m) => m[1]);
        for (const ref of [...new Set(refs)].slice(0, 5)) {
          const url = ref.startsWith("http") ? ref : `${host}${ref}`;
          try {
            const r2 = await fetch(url, { headers: { Accept: "application/json" } });
            tentativasSpec[url] = r2.status;
            if (!r2.ok) continue;
            const j = await r2.json().catch(() => null);
            if (j && (j.paths || j.swagger || j.openapi)) { spec = j; specUrl = url; break; }
          } catch (e) {
            tentativasSpec[url] = e instanceof Error ? e.message : "erro";
          }
        }
      } catch (e) {
        tentativasSpec["html"] = e instanceof Error ? e.message : "erro";
      }
    }
    if (spec?.paths) {
      const todos = Object.keys(spec.paths);
      const relevantes: Record<string, string[]> = {};
      for (const path of todos) {
        if (/cota|frete|simul|calc|track|rastre|ocorren/i.test(path)) {
          relevantes[path] = Object.keys(spec.paths[path] ?? {});
        }
      }
      especificacao = {
        origem: specUrl,
        basePath: spec.basePath ?? spec.servers?.[0]?.url ?? null,
        totalEndpoints: todos.length,
        endpointsRelevantes: relevantes,
        // primeiros 80 paths para visão geral caso o filtro não pegue o certo
        todosOsPaths: todos.slice(0, 80),
      };
    } else {
      especificacao = { erro: "Spec não encontrada", tentativas: tentativasSpec };
    }
  }

  return Response.json({ ok: true, config: configVisivel, loginTeste: loginResumo, cotacaoTeste, especificacao });
}

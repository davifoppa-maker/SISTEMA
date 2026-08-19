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
  // especificação JSON e lista os endpoints verdadeiros. Os candidatos deram 403
  // (existem, mas exigem auth) → agora busca AUTENTICADO com o token do login, e
  // vasculha o HTML + JS da página de docs atrás da referência exata da spec.
  let especificacao: Record<string, unknown> | null = null;
  if (u.searchParams.get("spec") !== "0") {
    const host = c.apiBaseUrl.replace(/\/api\/v\d+$/, ""); // https://multi.brudam.com.br
    const token = loginTeste.ok ? (loginTeste as { token: string }).token : null;
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const tentativasSpec: Record<string, number | string> = {};
    let spec: any = null;
    let specUrl = "";

    const tentaSpec = async (url: string) => {
      if (spec) return;
      try {
        const r = await fetch(url, { headers: { Accept: "application/json", ...authHeaders } });
        tentativasSpec[url] = r.status;
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        if (j && (j.paths || j.swagger || j.openapi)) { spec = j; specUrl = url; }
      } catch (e) {
        tentativasSpec[url] = e instanceof Error ? e.message : "erro";
      }
    };

    // 1) Candidatos diretos — agora com o Bearer token (antes davam 403 sem auth).
    for (const url of [
      `${host}/docs/swagger.json`, `${host}/docs/openapi.json`, `${host}/docs/api-docs.json`,
      `${host}/swagger.json`, `${host}/openapi.json`, `${host}/api/v1/docs.json`, `${host}/api/docs.json`,
      `${host}/docs/data/swagger.json`, `${host}/docs/v1.json`,
    ]) await tentaSpec(url);

    // 2) HTML da página de docs: referências .json/.yaml, config url:, e arquivos JS.
    const refsAchadas: string[] = [];
    if (!spec) {
      try {
        const r = await fetch(`${host}/docs/`, { headers: { Accept: "text/html", ...authHeaders } });
        const html = await r.text();
        tentativasSpec[`${host}/docs/ (html)`] = r.status;
        const abs = (ref: string) =>
          ref.startsWith("http") ? ref : ref.startsWith("/") ? `${host}${ref}` : `${host}/docs/${ref}`;
        const doHtml = [
          ...[...html.matchAll(/["'\(]([^"'\)\s]+\.(?:json|ya?ml))["'\)]/gi)].map((m) => m[1]),
          ...[...html.matchAll(/url['"]?\s*[:=]\s*["']([^"']+)["']/gi)].map((m) => m[1]),
        ];
        refsAchadas.push(...doHtml);
        // JS da página (o Swagger UI costuma configurar a spec num init.js).
        const jsSrcs = [...html.matchAll(/src=["']([^"']+\.js[^"']*)["']/gi)].map((m) => m[1]).slice(0, 6);
        for (const src of jsSrcs) {
          if (spec) break;
          try {
            const rj = await fetch(abs(src), { headers: authHeaders });
            if (!rj.ok) continue;
            const js = await rj.text();
            refsAchadas.push(
              ...[...js.matchAll(/["'\(]([^"'\)\s]+\.(?:json|ya?ml))["'\)]/gi)].map((m) => m[1]),
              ...[...js.matchAll(/url['"]?\s*[:=]\s*["']([^"']+)["']/gi)].map((m) => m[1]),
            );
          } catch { /* segue */ }
        }
        const unicas = [...new Set(refsAchadas)]
          .filter((x) => !/^https?:\/\/(?!multi\.brudam)/.test(x)) // só do próprio host
          .filter((x) => !/\.(js|css|png|svg|ico)(\?|$)/i.test(x))
          .slice(0, 12);
        for (const ref of unicas) await tentaSpec(abs(ref));
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
        todosOsPaths: todos.slice(0, 80),
      };
    } else {
      // /docs/swagger.php respondeu 200 mas não foi reconhecido como spec —
      // captura o conteúdo cru para ver o formato (JSON? YAML? outra estrutura?).
      let swaggerPhp: Record<string, unknown> | null = null;
      try {
        const r = await fetch(`${host}/docs/swagger.php`, { headers: { Accept: "application/json", ...authHeaders } });
        const texto = await r.text();
        // Se for JSON válido, lista as chaves de topo e procura paths em qualquer nível.
        let chaves: string[] | null = null;
        let pathsAchados: string[] | null = null;
        try {
          const j = JSON.parse(texto);
          chaves = Object.keys(j).slice(0, 20);
          const buscaPaths = (o: any, prof: number): string[] | null => {
            if (!o || typeof o !== "object" || prof > 3) return null;
            if (o.paths && typeof o.paths === "object") return Object.keys(o.paths);
            for (const v of Object.values(o)) {
              const r2 = buscaPaths(v, prof + 1);
              if (r2) return r2;
            }
            return null;
          };
          pathsAchados = buscaPaths(j, 0);
        } catch { /* não é JSON */ }
        // JSON.parse falha em algum caractere do PHP — extrai os paths por REGEX
        // direto do texto (chaves que começam com "/" seguidas de "{").
        const porRegex = [...new Set(
          [...texto.matchAll(/"(\/(?:[a-zA-Z0-9_\-{}]+\/)*[a-zA-Z0-9_\-{}]+)"\s*:\s*\{/g)].map((m) => m[1]),
        )];
        const relevantesRegex = porRegex.filter((x) => /cota|frete|simul|calc|track|rastre|ocorren|coleta|minuta|cte|preco|tabela/i.test(x));
        swaggerPhp = {
          status: r.status,
          contentType: r.headers.get("content-type"),
          chavesDeTopo: chaves,
          pathsAchados: pathsAchados?.slice(0, 60) ?? null,
          pathsPorRegex: porRegex.slice(0, 100),
          relevantes: relevantesRegex,
          inicioDoConteudo: porRegex.length > 0 ? null : texto.slice(0, 1500),
        };
      } catch (e) {
        swaggerPhp = { erro: e instanceof Error ? e.message : "erro" };
      }
      especificacao = {
        erro: "Spec não encontrada nos formatos conhecidos",
        swaggerPhp,
        tentativas: tentativasSpec,
      };
    }
  }

  return Response.json({ ok: true, config: configVisivel, loginTeste: loginResumo, cotacaoTeste, especificacao });
}

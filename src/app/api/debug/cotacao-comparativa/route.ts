import { getProvider } from "@/lib/services/freight/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Comparativo rápido de cotação SEM pedido no sistema (roda em produção).
//   GET /api/debug/cotacao-comparativa?k=exxdebug
//   Defaults: caso Natal-RN (162x Caixa 10, 1400kg) — sobrepor via query:
//   &cep=...&cnpj=...&peso=...&vol=...&valores=89000,39000&alt=0.17&larg=0.32&comp=0.45
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("k") !== "exxdebug") {
    return Response.json({ ok: false, error: "não autorizado" }, { status: 403 });
  }
  const cep = (u.searchParams.get("cep") || "59080100").replace(/\D/g, "");
  const cnpj = (u.searchParams.get("cnpj") || "30649896000103").replace(/\D/g, "");
  const peso = Number(u.searchParams.get("peso") || 1400);
  const vol = Number(u.searchParams.get("vol") || 162);
  const alt = Number(u.searchParams.get("alt") || 0.17);
  const larg = Number(u.searchParams.get("larg") || 0.32);
  const comp = Number(u.searchParams.get("comp") || 0.45);
  const valores = (u.searchParams.get("valores") || "89000,39000")
    .split(",").map((x) => Number(x.trim())).filter((x) => x > 0);
  const ids = (u.searchParams.get("transportadoras") || "braspress,translovato,brudam")
    .split(",").map((x) => x.trim()).filter(Boolean);

  const resultados: Record<string, Record<string, unknown>> = {};
  for (const valor of valores) {
    const linha: Record<string, unknown> = {};
    for (const id of ids) {
      const p = getProvider(id);
      if (!p || !p.isConfigured()) { linha[id] = "não configurada"; continue; }
      try {
        const r = await p.quote({
          cnpjDestinatario: cnpj,
          cepDestino: cep,
          vlrMercadoria: valor,
          peso,
          volumes: vol,
          cubagem: [{ altura: alt, largura: larg, comprimento: comp, volumes: vol }],
        });
        linha[id] = r.ok
          ? { frete: r.data.totalFrete, prazoDias: r.data.prazo ?? null }
          : { erro: r.error };
      } catch (e) {
        linha[id] = { erro: e instanceof Error ? e.message : "erro" };
      }
    }
    resultados[`NF R$ ${valor.toLocaleString("pt-BR")}`] = linha;
  }
  return Response.json({
    ok: true,
    cenario: { cepDestino: cep, cnpjDestinatario: cnpj, pesoKg: peso, volumes: vol, caixa: `${comp}×${larg}×${alt} m`, m3: Number((alt * larg * comp * vol).toFixed(3)) },
    resultados,
  });
}

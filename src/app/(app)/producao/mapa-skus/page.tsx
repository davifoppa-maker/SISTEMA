import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getCatalog } from "@/lib/catalog";
import { getEstoqueReport, EstoqueIndisponivelError } from "@/lib/services/estoque";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Palavras genéricas que não ajudam no casamento.
const STOP = new Set(["pote", "un", "nyer", "de", "e", "da", "do", "sleev", "kg", "g"]);
function tokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

export default async function MapaSkusPage() {
  const catalog = await getCatalog();

  let erro: string | null = null;
  let balanco: { nome: string; sku?: string; quantidade: number }[] = [];
  try {
    const rep = await getEstoqueReport();
    balanco = rep.itens
      .filter((i) => i.categoria === "produto_acabado")
      .map((i) => ({ nome: i.nome, sku: i.sku, quantidade: i.quantidade }));
  } catch (e) {
    erro = e instanceof EstoqueIndisponivelError ? e.message : "Balanço indisponível.";
  }

  // Sugere o SKU do catálogo por sobreposição de palavras (melhor esforço).
  const catTokens = catalog.map((p) => ({ sku: p.sku, nome: p.name, toks: new Set(tokens(p.name)) }));
  function sugerir(nome: string): { sku: string; nome: string; score: number } | null {
    const t = tokens(nome);
    if (t.length === 0) return null;
    let best: { sku: string; nome: string; score: number } | null = null;
    for (const c of catTokens) {
      let score = 0;
      for (const w of t) if (c.toks.has(w)) score++;
      if (score > 0 && (!best || score > best.score)) best = { sku: c.sku, nome: c.nome, score };
    }
    return best;
  }

  const linhas = balanco.map((b) => ({ ...b, sugestao: sugerir(b.nome) }));

  return (
    <>
      <PageHeader
        title="🔗 Mapa de SKUs (balanço × sistema)"
        description="Use para preencher a coluna SKU do balanço. Mostra o SKU já no balanço e o SKU sugerido pelo catálogo do sistema (confira antes de colar)."
      />

      {erro ? (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">⚠️ {erro}</div>
      ) : null}

      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Produtos do balanço ({linhas.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">Nome no balanço</th>
                  <th className="px-4 py-2">SKU no balanço</th>
                  <th className="px-4 py-2">SKU sugerido (sistema)</th>
                  <th className="px-4 py-2">Nome no catálogo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium text-white">{l.nome}</td>
                    <td className="px-4 py-2 text-slate-300">{l.sku ?? <span className="text-amber-400">— (vazio)</span>}</td>
                    <td className="px-4 py-2 font-mono text-sky-300">{l.sugestao?.sku ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-400">{l.sugestao?.nome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold text-white">
            Catálogo do sistema — referência ({catalog.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                  <th className="px-4 py-2">SKU</th>
                  <th className="px-4 py-2">Nome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {catalog.map((p) => (
                  <tr key={p.sku}>
                    <td className="px-4 py-2 font-mono text-sky-300">{p.sku}</td>
                    <td className="px-4 py-2 text-white">{p.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

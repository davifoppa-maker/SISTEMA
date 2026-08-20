import { PageHeader } from "@/components/page-header";
import { CAIXAS, caixaSugerida } from "@/lib/services/freight/cubagem";
import { PRODUCT_MEASURES } from "@/lib/services/freight/data/product-measures";
import { GuiaCaixasClient, type ProdutoCaixa } from "./guia-client";

export const dynamic = "force-dynamic";

// Guia de Caixas da expedição: qual caixa usar para cada produto.
// Gerado automaticamente do cadastro de medidas (product-measures) + catálogo
// de caixas — produto novo com medida cadastrada entra sozinho aqui.
export default function GuiaCaixasPage() {
  const produtos: ProdutoCaixa[] = Object.entries(PRODUCT_MEASURES).map(([sku, m]) => {
    const c = caixaSugerida(m);
    return {
      sku,
      produto: m.desc,
      medidaProduto: m.comprimentoCm > 0 ? `${m.comprimentoCm}×${m.larguraCm}×${m.alturaCm} cm` : "—",
      caixa: c.nome,
      tipo: c.tipo,
      medidaCaixa: c.medidas,
    };
  });

  const catalogoCaixas = CAIXAS.map((c) => ({
    nome: c.nome,
    medidas: `${c.comprimentoCm}×${c.larguraCm}×${c.alturaCm} cm`,
  }));

  return (
    <>
      <PageHeader
        title="📦 Guia de Caixas"
        description="Qual caixa usar para cada produto. Gerado do cadastro de medidas — produto novo entra sozinho."
      />
      <GuiaCaixasClient produtos={produtos} catalogoCaixas={catalogoCaixas} />
    </>
  );
}

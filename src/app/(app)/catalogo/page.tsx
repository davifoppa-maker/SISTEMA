import { getCatalog } from "@/lib/catalog";
import { CATALOG } from "@/lib/product-costs";
import { matchStandard } from "@/lib/sku-normalize";
import { CatalogoClient } from "./catalogo-client";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const produtos = await getCatalog();
  const padraoSkus = new Set(CATALOG.map((p) => p.sku));

  // Unifica na visão: entradas auto-cadastradas (só no banco) que são o MESMO
  // produto de um SKU padrão (nome/sabor) são escondidas — o custo é controlado
  // pelo SKU padrão. A remoção do banco e o remapeamento dos pedidos ficam a
  // cargo da peneira (/api/catalogo/normalizar e cron).
  const visiveis = produtos.filter((p) => {
    if (padraoSkus.has(p.sku)) return true; // SKU padrão sempre aparece
    return !matchStandard(p.name, p.sku); // esconde duplicata de um padrão
  });

  return <CatalogoClient produtos={visiveis} />;
}

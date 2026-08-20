import { PageHeader } from "@/components/page-header";
import { CalculadoraClient } from "./calc-client";

export const dynamic = "force-dynamic";

// Calculadora de Custos & Preço: custo do produto pela ENGENHARIA (Olist) ×
// preços dos insumos (atualizados mensalmente aqui) + simulador de venda
// (imposto, cartão, comissão, custo fixo → lucro/margem).
export default function CalculadoraPage() {
  return (
    <>
      <PageHeader
        title="🧮 Calculadora de Custos"
        description="Custo pela engenharia (insumos × preços do mês, com perda de lote) + simulador: vendendo a X, quanto sobra."
      />
      <CalculadoraClient />
    </>
  );
}

export type ProductType = "proteico" | "nao_proteico" | "acessorio";

export interface Product {
  sku: string;
  name: string;
  tabela: number;
  cost: number;
  type: ProductType;
}

export const CATALOG: Product[] = [
  // Proteicos
  { sku: "NYER26004", name: "Whey Refill 420g Chocolate", tabela: 142.0, cost: 26.0, type: "proteico" },
  { sku: "NYER26005", name: "Whey Refill 420g Morango", tabela: 142.0, cost: 26.0, type: "proteico" },
  { sku: "NYER26006", name: "Whey Refill 420g Leitinho", tabela: 142.0, cost: 26.0, type: "proteico" },
  { sku: "NYER26001", name: "Whey Refill 900g Chocolate", tabela: 289.9, cost: 55.0, type: "proteico" },
  { sku: "NYER26002", name: "Whey Refill 900g Morango", tabela: 289.9, cost: 55.0, type: "proteico" },
  { sku: "NYER26003", name: "Whey Refill 900g Leitinho", tabela: 289.9, cost: 55.0, type: "proteico" },
  { sku: "NYER26007", name: "Whey Refill 1kg Chocolate", tabela: 319.9, cost: 57.9, type: "proteico" },
  { sku: "NYER26008", name: "Whey Refill 1kg Morango", tabela: 319.9, cost: 57.9, type: "proteico" },
  { sku: "NYER26009", name: "Whey Refill 1kg Baunilha", tabela: 319.9, cost: 57.9, type: "proteico" },
  { sku: "NYER26010", name: "Whey Refill 1kg Cookies", tabela: 319.9, cost: 57.9, type: "proteico" },
  { sku: "NYER26011", name: "Whey Refill 1kg Doce de Leite", tabela: 319.9, cost: 57.9, type: "proteico" },
  { sku: "NYER26012", name: "Whey Gourmet 1kg Chocolate Trufado", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER26013", name: "Whey Gourmet 1kg Milkshake", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER26014", name: "Whey Gourmet 1kg Leitinho", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER26015", name: "Whey Gourmet 1kg Açaí", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER26016", name: "Whey Gourmet 1kg Mousse Maracujá", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER260344", name: "Whey Gourmet 1kg Chocolate Branco", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER260428", name: "Whey Gourmet 1kg Chocolate Maltado", tabela: 299.9, cost: 62.0, type: "proteico" },
  { sku: "NYER260430", name: "Hydro Protein 820g Chocolate Maltado", tabela: 149.9, cost: 50.0, type: "proteico" },
  { sku: "NYER260431", name: "Hydro Protein 820g Original", tabela: 149.9, cost: 48.0, type: "proteico" },
  { sku: "NYER260432", name: "Hydro Protein 820g Chocolate", tabela: 149.9, cost: 48.0, type: "proteico" },
  { sku: "NYER260433", name: "Hydro Protein 820g Milkshake", tabela: 149.9, cost: 48.0, type: "proteico" },
  { sku: "NYER6921", name: "Beff Protein 900g Frutas Vermelhas", tabela: 299.9, cost: 69.9, type: "proteico" },
  { sku: "NYER21321", name: "Beff Protein 900g Frutas Amarelas", tabela: 299.9, cost: 69.9, type: "proteico" },

  // Não-Proteicos
  { sku: "NYER26028", name: "Creatina Refill 150g", tabela: 59.9, cost: 9.9, type: "nao_proteico" },
  { sku: "NYER26029", name: "Creatina Refill 300g", tabela: 68.9, cost: 13.9, type: "nao_proteico" },
  { sku: "NYER260434", name: "Creatina Pote 300g", tabela: 74.9, cost: 13.9, type: "nao_proteico" },
  { sku: "NYER26030", name: "Creatina Refill 500g", tabela: 99.9, cost: 30.0, type: "nao_proteico" },
  { sku: "NYER26060", name: "Magnésio Inositol 250g", tabela: 99.9, cost: 23.0, type: "nao_proteico" },
  { sku: "NYER26017", name: "Darkpump Pré-Workout 300g Uva", tabela: 119.9, cost: 23.48, type: "nao_proteico" },
  { sku: "NYER26018", name: "Darkpump Pré-Workout 300g Frutas Vermelhas", tabela: 119.9, cost: 23.48, type: "nao_proteico" },
  { sku: "NYER26019", name: "Darkpump Pré-Workout 300g Limão", tabela: 119.9, cost: 23.48, type: "nao_proteico" },
  { sku: "NYER26020", name: "Purebust Pré-Workout 300g Uva", tabela: 99.9, cost: 21.48, type: "nao_proteico" },
  { sku: "NYER26021", name: "Purebust Pré-Workout 300g Morango", tabela: 99.9, cost: 21.48, type: "nao_proteico" },
  { sku: "NYER26022", name: "Purebust Pré-Workout 300g Limão", tabela: 99.9, cost: 21.48, type: "nao_proteico" },
  { sku: "NYER26023", name: "Termogênico Brutal 60cap", tabela: 99.9, cost: 18.15, type: "nao_proteico" },
  { sku: "NYER26024", name: "Diurético Seekdry 300g", tabela: 109.9, cost: 23.0, type: "nao_proteico" },
  { sku: "NYER26025", name: "Multivitamínico 60cap", tabela: 69.9, cost: 18.15, type: "nao_proteico" },
  { sku: "NYER26060", name: "Magnésio e Inositol 250g", tabela: 109.9, cost: 23.0, type: "nao_proteico" },

  // Acessórios
  { sku: "ACC001", name: "Camiseta Nyer Preta", tabela: 110.0, cost: 35.0, type: "acessorio" },
  { sku: "ACC002", name: "Camiseta Nyer Branca", tabela: 110.0, cost: 35.0, type: "acessorio" },
  { sku: "ACC003", name: "Coqueteleira Nyer", tabela: 39.9, cost: 6.5, type: "acessorio" },
];

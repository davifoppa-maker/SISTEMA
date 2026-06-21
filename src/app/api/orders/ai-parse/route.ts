import Anthropic from "@anthropic-ai/sdk";
import { CATALOG } from "@/lib/product-costs";
import { ok, fail } from "@/lib/api";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const catalogSummary = CATALOG.map(
  (p) => `SKU: ${p.sku} | Nome: ${p.name} | Preço tabela: R$${p.tabela}`
).join("\n");

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail("ANTHROPIC_API_KEY não configurada no servidor", 500);
  }

  const body = await req.json().catch(() => null);
  const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
  if (!texto) return fail("Texto vazio", 400);

  const systemPrompt = `Você é um assistente de vendas da NYER Nutrition. Sua tarefa é interpretar mensagens de pedidos escritas em linguagem natural (Portuguese) e extrair as informações estruturadas do pedido.

Catálogo de produtos disponíveis:
${catalogSummary}

Retorne SEMPRE um JSON válido com a seguinte estrutura:
{
  "cliente": {
    "nome": "Nome completo do cliente",
    "telefone": "Telefone (apenas dígitos, ou null)",
    "email": "E-mail ou null",
    "cpf": "CPF apenas dígitos ou null",
    "endereco": {
      "logradouro": "Rua/Av, número",
      "complemento": "Apto, bloco etc ou null",
      "bairro": "Bairro",
      "cidade": "Cidade",
      "uf": "UF 2 letras",
      "cep": "CEP apenas dígitos ou null"
    }
  },
  "itens": [
    {
      "sku": "SKU exato do catálogo ou null se não encontrado",
      "nome": "Nome do produto como mencionado",
      "quantidade": 1,
      "valor_unitario": 0.0
    }
  ],
  "observacao": "Observações gerais do pedido ou null",
  "confianca": "alta | media | baixa",
  "avisos": ["Lista de dúvidas ou itens não reconhecidos"]
}

Regras:
- Sempre tente mapear o produto para um SKU do catálogo. Se o produto for ambíguo, inclua nos avisos.
- Para valor_unitario, use o preço de tabela do catálogo se não especificado.
- Se o endereço estiver incompleto, coloque o que foi fornecido e avise.
- Responda APENAS com o JSON, sem texto adicional.`;

  try {
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      messages: [{ role: "user", content: texto }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fail("IA não retornou texto", 500);

    const raw = textBlock.text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw);
    return ok(parsed);
  } catch (err) {
    return fail("Erro ao processar com IA", 500, err instanceof Error ? err.message : err);
  }
}

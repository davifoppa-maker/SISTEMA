import Anthropic from "@anthropic-ai/sdk";
import { CATALOG } from "@/lib/product-costs";
import { ok, fail } from "@/lib/api";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const catalogSummary = CATALOG.map(
  (p) => `${p.sku} | ${p.name} | R$${p.tabela}`
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

Regras CRÍTICAS:
- NUNCA retorne um SKU que não existe no catálogo acima. Se o produto não está lá, retorne null para o SKU e avise.
- Sempre mapear para o SKU EXATO. Se não conseguir encontrar, deixe null e avise nos avisos.
- Para valor_unitario, use SEMPRE o preço de tabela do catálogo. Se o cliente mencionar outro preço, avise.
- Se o endereço estiver incompleto, coloque o que foi fornecido e avise.
- **IMPORTANTE - Mix de sabores:** Se o cliente mencionar "mesclar", "mix", "diversos sabores", "sortido" ou similar:
  - Identifique todos os SKUs daquele produto com sabores diferentes
  - Divida a quantidade total igualmente entre os SKUs
  - Crie um item SEPARADO pra cada SKU
  - Exemplo: "126 Whey Refill 1kg mesclar" → 4 itens de 31-32 cada (NYER26007, NYER26008, NYER26009, NYER26010)
- Escape corretamente todas as aspas dentro de strings.
- Responda APENAS com JSON válido, sem texto adicional.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: texto }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fail("IA não retornou texto", 500);

    let raw = textBlock.text.trim();
    // Remove markdown code blocks
    raw = raw.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
    raw = raw.replace(/^```\s*/i, "").replace(/\s*```$/, "");

    // Try to extract JSON if there's surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) raw = jsonMatch[0];

    const parsed = JSON.parse(raw);

    // RECONCILIAÇÃO COM O CATÁLOGO OFICIAL.
    // A IA não é confiável para o SKU: ela às vezes inventa códigos (ex.: um
    // "Aroma de Baunilha" 260311 que não existe). Aqui forçamos que todo item
    // tenha um SKU REAL do catálogo:
    //   1. Se o SKU retornado existe no catálogo → usa, e corrige nome/preço.
    //   2. Se não existe → tenta casar pelo nome do produto.
    //   3. Se nada casar → zera o SKU e avisa (não deixa lançar produto errado).
    const norm = (s: string) =>
      s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    const avisos: string[] = Array.isArray(parsed.avisos) ? parsed.avisos : [];

    if (Array.isArray(parsed.itens)) {
      parsed.itens = parsed.itens.map((item: any) => {
        const skuInformado = item?.sku ? String(item.sku).trim() : null;
        let prod = skuInformado ? CATALOG.find((p) => p.sku === skuInformado) : undefined;

        // Tenta casar pelo nome quando o SKU não bate (ou veio nulo).
        if (!prod && item?.nome) {
          const alvo = norm(String(item.nome));
          // match exato normalizado, senão "contém todas as palavras".
          prod =
            CATALOG.find((p) => norm(p.name) === alvo) ??
            CATALOG.find((p) => {
              const palavras = alvo.split(" ").filter((w) => w.length > 2);
              const nomeProd = norm(p.name);
              return palavras.length > 0 && palavras.every((w) => nomeProd.includes(w));
            });
        }

        if (prod) {
          return {
            sku: prod.sku,
            nome: prod.name,
            quantidade: Number(item?.quantidade) > 0 ? Number(item.quantidade) : 1,
            // Preço de tabela oficial, salvo se a IA trouxe um preço explícito
            // diferente (negociado) — nesse caso mantém, mas o aviso já existe.
            valor_unitario: Number(item?.valor_unitario) > 0 ? Number(item.valor_unitario) : prod.tabela,
          };
        }

        // Não encontrou no catálogo — não deixa passar um SKU inválido.
        avisos.push(`Produto "${item?.nome ?? "?"}" não encontrado no catálogo oficial — SKU removido. Ajuste manualmente.`);
        return {
          sku: null,
          nome: item?.nome ?? "Produto desconhecido",
          quantidade: Number(item?.quantidade) > 0 ? Number(item.quantidade) : 1,
          valor_unitario: Number(item?.valor_unitario) > 0 ? Number(item.valor_unitario) : 0,
        };
      });
    }

    parsed.avisos = avisos;
    return ok(parsed);
  } catch (err) {
    return fail("Erro ao processar com IA", 500, err instanceof Error ? err.message : err);
  }
}

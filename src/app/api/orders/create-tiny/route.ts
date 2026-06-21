import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

async function findProductId(sku: string): Promise<{ id?: number; error?: string }> {
  try {
    const res = await tinyFetch(`/produtos?filtro[codigo]=${encodeURIComponent(sku)}`);

    if (!res.ok) {
      return { error: `Status ${res.status}` };
    }

    const json = await res.json();
    const produtos = (json.data ?? json.itens ?? []) as Array<any>;

    if (produtos.length > 0 && produtos[0].id) {
      const id = Number(produtos[0].id);
      console.log(`[create-tiny] ${sku}: id=${id}`);
      return { id };
    }

    return { error: "Produto não encontrado" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Corpo inválido", 400);

  const { cliente, itens, observacao, clienteId } = body;
  if (!cliente?.nome || !itens?.length) return fail("Cliente e itens são obrigatórios", 400);

  // Resolver IDs dos produtos no Tiny
  const itensComId = await Promise.all(
    itens.map(async (i: { sku: string | null; nome: string; quantidade: number; valor_unitario: number }, idx: number) => {
      if (!i.sku) {
        console.log(`[create-tiny] Item ${idx}: sem SKU → descricao="${i.nome}"`);
        return { produto: { descricao: i.nome }, quantidade: i.quantidade, valorUnitario: i.valor_unitario };
      }

      const result = await findProductId(i.sku);

      if (result.id) {
        console.log(`[create-tiny] Item ${idx} (${i.sku}): id=${result.id}`);
        return { produto: { id: result.id }, quantidade: i.quantidade, valorUnitario: i.valor_unitario };
      }

      // Sempre fallback pra descrição, nunca deixar nulo
      console.warn(`[create-tiny] Item ${idx} (${i.sku}): ${result.error} → descricao="${i.nome}"`);
      return { produto: { descricao: i.nome }, quantidade: i.quantidade, valorUnitario: i.valor_unitario };
    })
  );

  // Tiny V3 POST /pedidos payload
  const payload: Record<string, unknown> = {
    situacao: 1, // Em aberto
    itens: itensComId,
    ...(observacao ? { observacoes: observacao } : {}),
  };

  // Se encontrou cliente existente, usar ID; caso contrário, criar novo
  if (clienteId) {
    payload.cliente = { id: clienteId };
  } else {
    payload.cliente = {
      nome: cliente.nome,
      tipoPessoa: "F",
      ...(cliente.cpf ? { cpf: cliente.cpf } : {}),
      ...(cliente.email ? { email: cliente.email } : {}),
      ...(cliente.telefone ? { telefone: cliente.telefone } : {}),
      enderecos: cliente.endereco?.logradouro
        ? [
            {
              tipo: "entrega",
              endereco: cliente.endereco.logradouro ?? "",
              complemento: cliente.endereco.complemento ?? "",
              bairro: cliente.endereco.bairro ?? "",
              municipio: cliente.endereco.cidade ?? "",
              uf: cliente.endereco.uf ?? "",
              cep: cliente.endereco.cep ?? "",
            },
          ]
        : [],
    };
  }

  // Retry com backoff exponencial para rate limit
  async function createWithRetry(maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await tinyFetch("/pedidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        let json: unknown;
        try { json = JSON.parse(text); } catch { json = { raw: text }; }

        // Se for 429 (rate limit), retry com backoff
        if (res.status === 429 && attempt < maxAttempts) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.log(`[create-tiny] Rate limited, tentando novamente em ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (!res.ok) {
          const errorMsg = typeof json === "object" && json ? JSON.stringify(json).slice(0, 500) : text.slice(0, 500);
          throw new Error(`Tiny ${res.status}: ${errorMsg}`);
        }

        return json;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
      }
    }
  }

  try {
    console.log("[create-tiny] Payload final:", JSON.stringify(payload, null, 2));
    const result = await createWithRetry();
    return ok({ message: "Pedido criado no Tiny", tiny: result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[create-tiny] Erro:", errMsg);
    return fail(`Erro ao criar pedido no Tiny: ${errMsg}`, 500);
  }
}

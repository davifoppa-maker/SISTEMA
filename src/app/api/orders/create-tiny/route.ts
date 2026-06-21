import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Corpo inválido", 400);

  const { cliente, itens, observacao, clienteId } = body;
  if (!cliente?.nome || !itens?.length) return fail("Cliente e itens são obrigatórios", 400);

  // Tiny V3 POST /pedidos payload
  const payload: Record<string, unknown> = {
    situacao: 1, // Em aberto
    itens: itens.map((i: { sku: string | null; nome: string; quantidade: number; valor_unitario: number }) => ({
      produto: i.sku ? { codigo: i.sku } : { descricao: i.nome },
      quantidade: i.quantidade,
      valorUnitario: i.valor_unitario,
    })),
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

  try {
    console.log("[lançador] Payload enviado:", JSON.stringify(payload, null, 2));

    const res = await tinyFetch("/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    console.log("[lançador] Tiny response:", res.status, json);

    if (!res.ok) {
      return fail(
        `Tiny ${res.status}: ${typeof json === "object" && json ? JSON.stringify(json).slice(0, 500) : text.slice(0, 500)}`,
        res.status
      );
    }

    return ok({ message: "Pedido criado no Tiny", tiny: json });
  } catch (err) {
    return fail("Erro ao criar pedido no Tiny", 500, err instanceof Error ? err.message : err);
  }
}

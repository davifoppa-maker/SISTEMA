import { tinyFetch, gravarTransporteNoTiny } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

// Criar pedido envolve várias chamadas ao Tiny (com retry de rate limit), então
// damos mais tempo para a função não ser cortada no meio (timeout padrão é 10s).
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return fail("Corpo inválido", 400);

  const { cliente, itens, observacao, clienteId, vendedorNome, transportadoraNome, formaPagamento } = body;
  if (!cliente?.nome || !itens?.length) return fail("Cliente e itens são obrigatórios", 400);

  // Validar que todos os itens têm SKU
  const itensSemSku = itens.filter((i: any) => !i.sku);
  if (itensSemSku.length > 0) {
    const nomes = itensSemSku.map((i: any) => `"${i.nome}"`).join(", ");
    return fail(`Produtos sem SKU não podem ser lançados: ${nomes}. Verifique o catálogo ou ajuste o pedido.`, 400);
  }

  // Buscar IDs dos produtos no Tiny pelo SKU NYER cadastrado.
  const itensFormatados = await Promise.all(
    itens.map(async (i: { sku: string | null; nome: string; quantidade: number; valor_unitario: number }) => {
      let prodId: number | null = null;

      if (!i.sku) {
        throw new Error(`Item "${i.nome}" sem SKU — não consegue criar no Tiny`);
      }

      // ISOLA SÓ OS PRODUTOS COM SKU NYER CADASTRADO NO TINY.
      // Busca pelo código (param V3 correto: ?codigo=) e exige que o produto
      // retornado tenha EXATAMENTE o nosso SKU. Sem busca por nome (que pegava
      // matéria-prima/marca branca errada). Se não tiver o SKU NYER cadastrado,
      // bloqueia — nunca lança um produto adivinhado.
      try {
        const res = await tinyFetch(`/produtos?codigo=${encodeURIComponent(i.sku)}`);
        if (res.ok) {
          const json = await res.json();
          const prods = (json.data ?? json.itens ?? []) as Array<{ id: number | string; sku?: string; codigo?: string }>;
          const exato = prods.find((p) => String(p.sku ?? p.codigo ?? "").trim() === String(i.sku).trim());
          if (exato) prodId = Number(exato.id);
        }
      } catch {
        /* trata como não encontrado abaixo */
      }

      if (prodId) {
        return { produto: { id: prodId }, quantidade: i.quantidade, valorUnitario: i.valor_unitario };
      }

      throw new Error(`Produto "${i.nome}" (SKU ${i.sku}) não está cadastrado no Tiny com esse código NYER. Cadastre o produto no Tiny com o código ${i.sku} para poder lançá-lo.`);
    })
  );

  // O Tiny V3 EXIGE idContato no pedido — não aceita criar o cliente inline.
  // Se nenhum cliente existente foi selecionado, criamos o contato primeiro
  // (POST /contatos) e usamos o id retornado.
  let idContato: number | string | null = clienteId ?? null;

  if (!idContato) {
    // Tenta achar um contato já existente pelo nome (evita duplicar cadastro).
    try {
      const sres = await tinyFetch(`/contatos?nome=${encodeURIComponent(cliente.nome)}&limit=5`);
      if (sres.ok) {
        const sjson = await sres.json();
        const achados = (sjson.data ?? sjson.itens ?? []) as Array<{ id: number | string }>;
        if (achados.length > 0) idContato = achados[0].id;
      }
    } catch {
      /* segue para criar */
    }
  }

  if (!idContato) {
    // Cria o contato no Tiny.
    const contatoPayload: Record<string, unknown> = {
      nome: cliente.nome,
      tipoPessoa: "F",
      ...(cliente.cpf ? { cpfCnpj: cliente.cpf } : {}),
      ...(cliente.email ? { email: cliente.email } : {}),
      ...(cliente.telefone ? { telefone: cliente.telefone } : {}),
      ...(cliente.endereco?.logradouro
        ? {
            endereco: {
              endereco: cliente.endereco.logradouro ?? "",
              numero: cliente.endereco.numero ?? "0",
              complemento: cliente.endereco.complemento ?? "",
              bairro: cliente.endereco.bairro ?? "",
              municipio: cliente.endereco.cidade ?? "",
              cep: cliente.endereco.cep ?? "",
              uf: cliente.endereco.uf ?? "",
            },
          }
        : {}),
    };

    const cres = await tinyFetch("/contatos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contatoPayload),
    });
    const ctext = await cres.text();
    let cjson: any = null;
    try { cjson = ctext ? JSON.parse(ctext) : null; } catch { /* */ }
    if (!cres.ok) {
      return fail(`Não foi possível criar o contato no Tiny: ${ctext.slice(0, 300)}`, 502);
    }
    idContato = cjson?.id ?? cjson?.data?.id ?? null;
    if (!idContato) {
      return fail(`Contato criado mas sem id retornado: ${ctext.slice(0, 200)}`, 502);
    }
  }

  // Resolve o vendedor (idVendedor) pelo nome, consultando o Tiny.
  let idVendedor: number | string | null = null;
  if (vendedorNome) {
    try {
      const vres = await tinyFetch(`/vendedores?nome=${encodeURIComponent(vendedorNome)}&limit=5`);
      if (vres.ok) {
        const vjson = await vres.json();
        const vends = (vjson.data ?? vjson.itens ?? []) as Array<{ id: number | string; nome?: string }>;
        const alvo = String(vendedorNome).trim().toLowerCase();
        const match = vends.find((v) => String(v.nome ?? "").trim().toLowerCase() === alvo) ?? vends[0];
        if (match) idVendedor = match.id;
      }
    } catch {
      /* vendedor best-effort */
    }
  }

  // Tiny V3 POST /pedidos payload.
  // situacao 0 = "Em aberto" — CONFIRMADO pelos pedidos reais da conta (os
  // pedidos normais têm situacao 0). O pedido nasce para CONFERÊNCIA da equipe.
  // (Omitir a situação fazia o Tiny criar como "faturado".)
  const payload: Record<string, unknown> = {
    idContato,
    situacao: 0,
    itens: itensFormatados,
    ...(idVendedor ? { idVendedor } : {}),
  };

  // Observação com forma de pagamento e vendedor (para conferência), além da
  // observação original do pedido.
  const obsPartes: string[] = [];
  if (observacao) obsPartes.push(String(observacao));
  if (formaPagamento) obsPartes.push(`Forma de pagamento: ${formaPagamento}`);
  if (vendedorNome && !idVendedor) obsPartes.push(`Vendedor: ${vendedorNome}`);
  if (obsPartes.length) {
    payload.observacoes = obsPartes.join(" | ");
  }

  // Retry com backoff exponencial para rate limit
  async function createWithRetry(maxAttempts = 3): Promise<{ id: unknown; numeroPedido: unknown; raw: unknown }> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await tinyFetch("/pedidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const text = await res.text();

        // Se for 429 (rate limit), retry com backoff
        if (res.status === 429 && attempt < maxAttempts) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          console.log(`[create-tiny] Rate limited, tentando novamente em ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }

        if (!res.ok) {
          const errorMsg = json ? JSON.stringify(json).slice(0, 500) : text.slice(0, 500);
          throw new Error(`Tiny ${res.status}: ${errorMsg}`);
        }

        // SUCESSO só é válido se o Tiny devolver um id de pedido.
        // Sem id, o pedido NÃO foi criado — não declarar sucesso falso.
        const id = json?.id ?? json?.data?.id ?? null;
        const numeroPedido = json?.numeroPedido ?? json?.data?.numeroPedido ?? null;

        if (!id) {
          throw new Error(
            `Tiny respondeu ${res.status} mas não retornou id do pedido. Resposta: ${text.slice(0, 300) || "(vazia)"}`
          );
        }

        return { id, numeroPedido, raw: json };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxAttempts) throw lastErr;
      }
    }
    throw lastErr ?? new Error("Falha desconhecida ao criar pedido");
  }

  try {
    console.log("[create-tiny] Payload final:", JSON.stringify(payload, null, 2));
    const result = await createWithRetry();

    // Grava a transportadora no pedido (forma de envio + contato), via o
    // endpoint /despacho — best-effort, não bloqueia o sucesso do pedido.
    let transporte: unknown = null;
    if (transportadoraNome) {
      try {
        transporte = await gravarTransporteNoTiny(String(result.id), String(transportadoraNome));
      } catch (e) {
        transporte = { ok: false, body: e instanceof Error ? e.message : String(e) };
      }
    }

    return ok({
      message: `Pedido ${result.numeroPedido ?? result.id} criado no Tiny`,
      id: result.id,
      numeroPedido: result.numeroPedido,
      transporte,
      tiny: result.raw,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[create-tiny] Erro completo:", err);
    console.error("[create-tiny] Mensagem:", errMsg);
    return fail(errMsg || "Erro desconhecido ao criar pedido", 500);
  }
}

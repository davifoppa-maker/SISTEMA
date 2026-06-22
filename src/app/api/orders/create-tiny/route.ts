import { tinyFetch, gravarTransporteNoTiny } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

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

  // Buscar IDs dos produtos no Tiny
  const itensFormatados = await Promise.all(
    itens.map(async (i: { sku: string | null; nome: string; quantidade: number; valor_unitario: number }) => {
      let prodId: number | null = null;

      if (i.sku) {
        try {
          const res = await tinyFetch(`/produtos?filtro[codigo]=${encodeURIComponent(i.sku)}`);
          if (res.ok) {
            const json = await res.json();
            const prods = (json.data ?? json.itens ?? []) as Array<{ id: number | string; sku?: string; codigo?: string }>;
            // IMPORTANTE: o filtro do Tiny traz correspondências parciais.
            // Precisamos do produto cujo código/SKU é EXATAMENTE o nosso, senão
            // pega o produto errado (ex.: "260311" casando com outro item).
            const alvo = String(i.sku).trim();
            const exato = prods.find(
              (p) => String(p.sku ?? p.codigo ?? "").trim() === alvo
            );
            if (exato) prodId = Number(exato.id);
          }
        } catch {
          // continua sem ID
        }
      }

      if (prodId) {
        return { produto: { id: prodId }, quantidade: i.quantidade, valorUnitario: i.valor_unitario };
      }

      if (!i.sku) {
        throw new Error(`Item "${i.nome}" sem SKU — não consegue criar no Tiny`);
      }

      throw new Error(`Produto "${i.nome}" (SKU ${i.sku}) não encontrado no Tiny com código exato. Verifique se o SKU está cadastrado.`);
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
  // NÃO enviamos `situacao` — assim o Tiny cria o pedido no estado padrão
  // ("em aberto") para CONFERÊNCIA da equipe. Forçar um código estava gerando
  // "faturado".
  const payload: Record<string, unknown> = {
    idContato,
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

    // VERIFICAÇÃO: relê o pedido recém-criado para confirmar que ele realmente
    // existe no Tiny (e não foi só um 201 "fantasma"). Sem isso, não temos como
    // saber por que "não cai no Olist". Best-effort: não falha se a releitura der erro.
    let verificacao: { existe: boolean; situacao: unknown; numero: unknown } | null = null;
    try {
      const gres = await tinyFetch(`/pedidos/${encodeURIComponent(String(result.id))}`);
      if (gres.ok) {
        const ped = (await gres.json().catch(() => null)) as any;
        const p = ped?.pedido ?? ped?.data ?? ped ?? {};
        verificacao = {
          existe: Boolean(p?.id ?? p?.numeroPedido ?? p?.numero),
          situacao: p?.situacao ?? p?.codigoSituacao ?? p?.descricaoSituacao ?? null,
          numero: p?.numeroPedido ?? p?.numero ?? null,
        };
      } else {
        verificacao = { existe: false, situacao: `GET ${gres.status}`, numero: null };
      }
    } catch {
      /* releitura best-effort */
    }
    console.log("[create-tiny] Verificação pós-criação:", JSON.stringify(verificacao));

    // Grava a transportadora no pedido (forma de envio + contato), via o
    // endpoint /despacho — mesma rotina já usada no resto do sistema.
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
      verificacao,
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

import { tinyFetch } from "@/lib/services/tiny-api";
import { ok, fail } from "@/lib/api";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const nome = typeof body?.nome === "string" ? body.nome.trim() : "";

  if (!nome) return fail("Nome do cliente obrigatório", 400);

  try {
    const res = await tinyFetch(`/contatos?nome=${encodeURIComponent(nome)}&limit=20`);
    const json = await res.json();

    if (!res.ok) return fail(`Tiny retornou ${res.status}`, res.status);

    const clientes = (json.data ?? json.itens ?? []) as Array<{
      id: string | number;
      nome: string;
      cpf?: string;
      email?: string;
      telefone?: string;
    }>;

    return ok({
      clientes: clientes.map((c) => ({
        id: String(c.id),
        nome: c.nome,
        cpf: c.cpf || null,
        email: c.email || null,
        telefone: c.telefone || null,
      })),
    });
  } catch (err) {
    return fail("Erro ao buscar cliente", 500, err instanceof Error ? err.message : err);
  }
}

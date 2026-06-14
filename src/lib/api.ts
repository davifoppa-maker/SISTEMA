import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, extra?: unknown) {
  return NextResponse.json({ ok: false, error: message, extra }, { status });
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<
  { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }
> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, response: fail("JSON inválido", 400) };
  }
  try {
    return { ok: true, data: schema.parse(json) };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, response: fail("Validação falhou", 422, err.flatten()) };
    }
    return { ok: false, response: fail("Erro ao validar", 400) };
  }
}

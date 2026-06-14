import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

// Encerra a sessão do WhatsApp no worker (gera novo QR para reconectar).
export async function POST() {
  const base = process.env.WHATSAPP_WORKER_URL;
  if (!base) return fail("Worker não configurado", 503);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/logout`, {
      method: "POST",
      headers: { "x-worker-token": process.env.WHATSAPP_WORKER_TOKEN ?? "" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return ok(data);
  } catch (err) {
    return fail("Worker do WhatsApp indisponível", 502, err instanceof Error ? err.message : err);
  }
}

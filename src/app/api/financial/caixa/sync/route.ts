import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SHEET_ID = "1kEqwQ6zDWF3pmOP3viDxzmj_kTajiGlOPqA3Ox4XIlE";

function parseBRL(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizeName(s: string) {
  return s.toLowerCase().trim()
    .replace(/\s+/g, " ")
    .replace(/[()]/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // remove acentos
}

interface GvizCell {
  v?: unknown;
  f?: string;
}

async function fetchAllSheets(): Promise<{ name: string; rows: Array<Array<{ raw: unknown; formatted: string }>> }[]> {
  // Fetch sheet metadata to get all tab names/gids
  const metaUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&tq=SELECT%201%20LIMIT%201`;
  const metaRes = await fetch(metaUrl, { cache: "no-store" });
  const metaText = await metaRes.text();
  const metaJson = metaText.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const meta = JSON.parse(metaJson);

  // Try gid 0, 1, 2, 3 to cover multiple tabs
  const gids = [0, 1, 2, 3, 4];
  const results = [];

  for (const gid of gids) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.includes("table")) continue;
      const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
      const data = JSON.parse(json);
      if (!data?.table?.rows) continue;

      const rows = data.table.rows.map((row: { c: (GvizCell | null)[] }) =>
        (row.c ?? []).map((c) => ({
          raw: c?.v ?? null,
          formatted: c?.f ?? (c?.v != null ? String(c.v) : ""),
        }))
      );
      results.push({ name: `gid_${gid}`, rows });
    } catch {
      // skip this gid
    }
  }

  void meta; // suppress unused warning
  return results;
}

export async function POST() {
  try {
    const sheets = await fetchAllSheets();

    const current: Record<string, number> = {};
    const future: Record<string, number> = {};

    for (const sheet of sheets) {
      let mode: "none" | "current" | "future" = "none";

      for (const row of sheet.rows) {
        const col0 = (row[0]?.formatted ?? "").trim();
        const col1raw = row[1]?.raw;
        const col1fmt = (row[1]?.formatted ?? "").trim();

        if (/^CAIXA$/i.test(col0)) { mode = "current"; continue; }
        if (/descri.+o caixa futuro/i.test(col0)) { mode = "future"; continue; }
        if (mode === "none") continue;
        if (!col0 || /^Bancos$/i.test(col0)) continue;

        // Try raw number first, then formatted string
        const val = parseBRL(col1raw) ?? parseBRL(col1fmt);
        if (val === null) continue;

        const key = normalizeName(col0);
        if (mode === "current") current[key] = val;
        else future[key] = val;
      }
    }

    const sb = getSupabaseAdmin();
    const { data: accounts, error: fetchErr } = await sb.from("cash_accounts").select("id, name");

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: `DB error: ${fetchErr.message}` });
    }
    if (!accounts?.length) {
      return NextResponse.json({ ok: false, error: "Nenhuma conta cadastrada. Execute o SQL de setup primeiro." });
    }

    let updated = 0;
    const notFound: string[] = [];

    for (const acc of accounts) {
      const key = normalizeName(acc.name);
      const cur = current[key] ?? null;
      const fut = future[key] ?? null;

      if (cur !== null || fut !== null) {
        const patch: Record<string, number | null> = {};
        if (cur !== null) patch.current_balance = cur;
        if (fut !== null) patch.future_balance = fut;
        await sb.from("cash_accounts").update(patch).eq("id", acc.id);
        updated++;
      } else {
        notFound.push(acc.name);
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      parsedCurrent: Object.keys(current).length,
      parsedFuture: Object.keys(future).length,
      notFound,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

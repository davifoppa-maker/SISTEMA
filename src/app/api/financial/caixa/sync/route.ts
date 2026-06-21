import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SHEET_ID = "1kEqwQ6zDWF3pmOP3viDxzmj_kTajiGlOPqA3Ox4XIlE";

function parseBRL(v: string): number | null {
  if (!v) return null;
  const clean = v.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function normalizeName(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

async function fetchSheetData(): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  // Strip the JSONP wrapper: google.visualization.Query.setResponse({...})
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);
  const rows: string[][] = [];
  for (const row of data.table.rows) {
    const cells = (row.c as Array<{ v: unknown } | null>).map((c) =>
      c?.v != null ? String(c.v) : ""
    );
    rows.push(cells);
  }
  return rows;
}

export async function POST() {
  try {
    const rows = await fetchSheetData();

    const current: Record<string, number> = {};
    const future: Record<string, number> = {};

    let mode: "none" | "current" | "future" = "none";

    for (const row of rows) {
      const col0 = row[0]?.trim() ?? "";
      const col1 = row[1]?.trim() ?? "";

      if (/^CAIXA$/i.test(col0)) { mode = "current"; continue; }
      if (/descrição caixa futuro/i.test(col0)) { mode = "future"; continue; }

      if (mode === "none") continue;

      // Skip header/total rows
      if (!col0 || /^Bancos$/i.test(col0)) continue;

      const val = parseBRL(col1);
      if (val === null) continue;

      const key = normalizeName(col0);
      if (mode === "current") current[key] = val;
      else future[key] = val;
    }

    const sb = getSupabaseAdmin();
    const { data: accounts } = await sb.from("cash_accounts").select("id, name");

    if (!accounts?.length) {
      return NextResponse.json({ ok: false, error: "Nenhuma conta no banco. Cadastre as contas primeiro." });
    }

    let updated = 0;
    for (const acc of accounts) {
      const key = normalizeName(acc.name);
      const cur = current[key] ?? null;
      const fut = future[key] ?? null;

      // Only update if found in sheet
      if (cur !== null || fut !== null) {
        const patch: Record<string, number | null> = {};
        if (cur !== null) patch.current_balance = cur;
        if (fut !== null) patch.future_balance = fut;

        await sb.from("cash_accounts").update(patch).eq("id", acc.id);
        updated++;
      }
    }

    return NextResponse.json({ ok: true, updated, current: Object.keys(current).length, future: Object.keys(future).length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

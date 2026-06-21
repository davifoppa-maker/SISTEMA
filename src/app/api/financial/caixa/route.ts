import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase-store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.from("cash_accounts").insert({
    company: body.company,
    name: body.name,
    current_balance: body.current_balance ?? null,
    future_balance: body.future_balance ?? null,
    sort_order: 99,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("cash_accounts")
    .update({ current_balance: body.current_balance, future_balance: body.future_balance })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

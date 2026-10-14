import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

// Lista de productos vigilados.
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, error } = await db().from("tracked_terms").select("term").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ terms: (data ?? []).map((r) => r.term) });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { term } = (await req.json().catch(() => ({}))) as { term?: string };
  const t = term?.trim().toLowerCase();
  if (!t) return NextResponse.json({ error: "Falta 'term'" }, { status: 400 });
  const { error } = await db().from("tracked_terms").upsert({ term: t });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ term: t });
}

export async function DELETE(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { term } = (await req.json().catch(() => ({}))) as { term?: string };
  if (!term) return NextResponse.json({ error: "Falta 'term'" }, { status: 400 });
  const { error } = await db().from("tracked_terms").delete().eq("term", term.trim().toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

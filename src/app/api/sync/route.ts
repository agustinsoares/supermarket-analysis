import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { syncStores, syncTerm } from "@/lib/sync";

export const maxDuration = 60;

// POST { "term": "lettmelk" }  -> busca ese término en Rema, Kiwi y Coop
// POST { "stores": true }      -> actualiza las tiendas físicas cercanas
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { term?: string; stores?: boolean };
  try {
    if (body.stores) return NextResponse.json({ stores: await syncStores() });
    const term = body.term?.trim();
    if (!term) return NextResponse.json({ error: "Falta 'term'" }, { status: 400 });
    return NextResponse.json({ term, results: await syncTerm(term) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

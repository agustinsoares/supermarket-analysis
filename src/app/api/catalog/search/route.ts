import { NextResponse } from "next/server";
import { unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

export type Suggestion = { itemId: number; name: string; brand: string | null; grams: number | null; image: string | null; price: number; chain: string; chains: number };

// GET ?q=lett -> productos del catálogo agrupados por EAN (el más barato de cada grupo).
export async function GET(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[,()%_*\\]/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db()
    .from("items")
    .select("id,chain,ean,name,brand,grams,image,current_price,valid_to")
    .eq("status", "active")
    .not("current_price", "is", null)
    .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
    .limit(150);

  const groups = new Map<string, Suggestion>();
  for (const r of data ?? []) {
    if (r.valid_to && r.valid_to < today) continue; // oferta caducada
    const key = r.ean ?? `id:${r.id}`;
    const price = Number(r.current_price);
    const g = groups.get(key);
    if (!g) groups.set(key, { itemId: r.id, name: r.name, brand: r.brand, grams: r.grams, image: r.image, price, chain: r.chain, chains: 1 });
    else {
      g.chains++;
      if (price < g.price) Object.assign(g, { itemId: r.id, price, chain: r.chain, image: g.image ?? r.image });
    }
  }
  return NextResponse.json({ results: [...groups.values()].sort((a, b) => b.chains - a.chains || a.price - b.price).slice(0, 15) });
}

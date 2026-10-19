import { CHAINS } from "./config";
import { db } from "./supabase";

export type ShoppingRow = { id: number; name: string; quantity: number; note: string | null; item_ref: number | null; checked: boolean };
export type PriceOption = { chain: string; price: number; name: string };
export type ShoppingLine = ShoppingRow & { options: PriceOption[]; best: PriceOption | null };
export type ChainTotal = { chain: string; total: number; covered: number; of: number };
export type ShoppingPlan = {
  lines: ShoppingLine[];
  totals: ChainTotal[];
  /** Tienda más barata que tiene TODOS los productos enlazados (null si ninguna). */
  bestSingle: ChainTotal | null;
  /** Comprar cada producto donde sea más barato. */
  mixed: { total: number; byChain: { chain: string; total: number; lines: { id: number; name: string; price: number }[] }[] } | null;
  unlinked: number;
};

type Cand = { id: number; chain: string; ean: string | null; name: string; current_price: number | null; valid_to: string | null; status: string };

/** Calcula el precio de la lista en cada cadena y la mejor forma de comprarla. Solo cuenta lo no marcado. */
export function buildPlan(rows: ShoppingRow[], refs: Cand[], sameEan: Cand[], today: string): ShoppingPlan {
  const live = (c: Cand) => c.status === "active" && c.current_price != null && (!c.valid_to || c.valid_to >= today);
  const refById = new Map(refs.map((r) => [r.id, r]));
  const byEan = new Map<string, Cand[]>();
  for (const c of sameEan.filter(live)) if (c.ean) byEan.set(c.ean, [...(byEan.get(c.ean) ?? []), c]);

  const lines: ShoppingLine[] = rows.map((r) => {
    const ref = r.item_ref ? refById.get(r.item_ref) : undefined;
    // Con EAN: el mismo producto en todas las cadenas. Sin EAN: solo el producto elegido.
    const cands = !ref ? [] : ref.ean ? (byEan.get(ref.ean) ?? []) : live(ref) ? [ref] : [];
    const perChain = new Map<string, PriceOption>();
    for (const c of cands) {
      const cur = perChain.get(c.chain);
      if (!cur || Number(c.current_price) < cur.price) perChain.set(c.chain, { chain: c.chain, price: Number(c.current_price), name: c.name });
    }
    const options = [...perChain.values()].sort((a, b) => a.price - b.price);
    return { ...r, options, best: options[0] ?? null };
  });

  const open = lines.filter((l) => !l.checked);
  const linked = open.filter((l) => l.item_ref != null);
  const totals: ChainTotal[] = CHAINS.map((c) => {
    let total = 0;
    let covered = 0;
    for (const l of linked) {
      const o = l.options.find((x) => x.chain === c.code);
      if (o) { total += o.price * l.quantity; covered++; }
    }
    return { chain: c.code, total: Math.round(total * 100) / 100, covered, of: linked.length };
  });

  const full = totals.filter((t) => t.of > 0 && t.covered === t.of).sort((a, b) => a.total - b.total);
  const priced = linked.filter((l) => l.best);
  let mixed: ShoppingPlan["mixed"] = null;
  if (priced.length) {
    const map = new Map<string, { chain: string; total: number; lines: { id: number; name: string; price: number }[] }>();
    let sum = 0;
    for (const l of priced) {
      const b = l.best as PriceOption;
      const line = b.price * l.quantity;
      sum += line;
      const g = map.get(b.chain) ?? { chain: b.chain, total: 0, lines: [] };
      g.total = Math.round((g.total + line) * 100) / 100;
      g.lines.push({ id: l.id, name: l.name, price: Math.round(line * 100) / 100 });
      map.set(b.chain, g);
    }
    mixed = { total: Math.round(sum * 100) / 100, byChain: [...map.values()].sort((a, b) => b.total - a.total) };
  }
  return { lines, totals, bestSingle: full[0] ?? null, mixed, unlinked: open.length - linked.length };
}

/** Lee la lista y los precios de Supabase y calcula el plan. */
export async function loadShoppingPlan(): Promise<ShoppingPlan> {
  const sb = db();
  const today = new Date().toISOString().slice(0, 10);
  const { data: rows, error } = await sb.from("shopping_items").select("id,name,quantity,note,item_ref,checked").order("checked").order("created_at");
  if (error) throw error;
  const list = (rows ?? []).map((r) => ({ ...r, quantity: Number(r.quantity) })) as ShoppingRow[];

  const refIds = [...new Set(list.map((r) => r.item_ref).filter((x): x is number => x != null))];
  let refs: Cand[] = [];
  let sameEan: Cand[] = [];
  const cols = "id,chain,ean,name,current_price,valid_to,status";
  if (refIds.length) {
    const { data } = await sb.from("items").select(cols).in("id", refIds);
    refs = (data ?? []) as Cand[];
    const eans = [...new Set(refs.map((r) => r.ean).filter((x): x is string => !!x))];
    if (eans.length) {
      const { data: d2 } = await sb.from("items").select(cols).in("ean", eans).eq("status", "active");
      sameEan = (d2 ?? []) as Cand[];
    }
  }
  return buildPlan(list, refs, sameEan, today);
}

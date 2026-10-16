import { AUTO_CHAINS, HOME, STORE_CHAINS, STORE_RADIUS_KM } from "./config";
import { nearbyStores, searchProducts, type KassalProduct } from "./kassal";
import { db } from "./supabase";

function toGrams(weight: number | null, unit: string | null): number | null {
  if (weight == null) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "g") return Math.round(weight);
  if (u === "kg") return Math.round(weight * 1000);
  return null;
}

function toRow(p: KassalProduct, chain: string) {
  const cats = p.category ?? [];
  const deepest = cats.length ? cats[cats.length - 1].name : null;
  return {
    id: p.id,
    chain,
    ean: p.ean,
    name: p.name,
    brand: p.brand,
    vendor: p.vendor,
    category: deepest,
    image: p.image,
    url: p.url,
    weight: p.weight,
    weight_unit: p.weight_unit,
    grams: toGrams(p.weight, p.weight_unit),
    current_price: p.current_price,
    current_unit_price: p.current_unit_price,
    price_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Busca `term` en cada cadena, guarda productos y registra los cambios de precio. */
export async function syncTerm(term: string) {
  const sb = db();
  const result: { chain: string; seen: number; changes: number; error?: string }[] = [];

  for (const chain of AUTO_CHAINS) {
    let seen = 0;
    let changes = 0;
    let error: string | undefined;
    try {
      const found = (await searchProducts(term, chain.code)).filter((p) => p.current_price != null);
      const ids = found.map((p) => p.id);
      const { data: before, error: e1 } = ids.length
        ? await sb.from("items").select("id,current_price,locked").in("id", ids)
        : { data: [], error: null };
      if (e1) throw e1;
      // Los productos editados a mano (locked) no se pisan con los datos de Kassalapp.
      const locked = new Set((before ?? []).filter((r) => r.locked).map((r) => r.id as number));
      const products = found.filter((p) => !locked.has(p.id));
      seen = products.length;
      if (seen) {
        const prev = new Map((before ?? []).map((r) => [r.id as number, r.current_price as number | null]));

        const { error: e2 } = await sb.from("items").upsert(products.map((p) => toRow(p, chain.code)));
        if (e2) throw e2;

        const history = products
          .filter((p) => !prev.has(p.id) || Number(prev.get(p.id)) !== Number(p.current_price))
          .map((p) => ({ item_id: p.id, price: p.current_price as number, unit_price: p.current_unit_price }));
        changes = history.length;
        if (history.length) {
          const { error: e3 } = await sb.from("price_history").insert(history);
          if (e3) throw e3;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await sb.from("sync_runs").insert({ term, chain: chain.code, items_seen: seen, price_changes: changes, error });
    result.push({ chain: chain.code, seen, changes, error });
  }
  return result;
}

/** Guarda las tiendas físicas de las tres cadenas cerca de casa. */
export async function syncStores() {
  const sb = db();
  let total = 0;
  for (const chain of STORE_CHAINS) {
    const stores = await nearbyStores(chain.storeGroup as string, HOME.lat, HOME.lng, STORE_RADIUS_KM);
    const rows = stores.map((s) => ({
      id: s.id,
      chain: s.group,
      name: s.name,
      address: s.address,
      lat: s.position ? Number(s.position.lat) : null,
      lng: s.position ? Number(s.position.lng) : null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await sb.from("physical_stores").upsert(rows);
      if (error) throw error;
    }
    total += rows.length;
  }
  return total;
}

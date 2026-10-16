// Cliente mínimo de la API de Kassalapp. Límite: 60 llamadas/minuto.
const BASE = "https://kassal.app/api/v1";
const MIN_GAP_MS = 1100;

let lastCall = 0;

async function throttle() {
  const wait = lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

export type KassalProduct = {
  id: number;
  name: string;
  brand: string | null;
  vendor: string | null;
  ean: string | null;
  url: string | null;
  image: string | null;
  category: { id: number; depth: number; name: string }[] | null;
  current_price: number | null;
  current_unit_price: number | null;
  weight: number | null;
  weight_unit: string | null;
  store: { name: string; code: string } | null;
};

export type KassalStore = {
  id: number;
  group: string;
  name: string;
  address: string | null;
  position: { lat: string; lng: string } | null;
};

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const token = process.env.KASSAL_TOKEN;
  if (!token) throw new Error("Falta KASSAL_TOKEN");
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after")) || 10;
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Kassalapp ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }
  throw new Error("Kassalapp: demasiados reintentos (429)");
}

export async function searchProducts(term: string, store: string, size = 100) {
  const r = await get<{ data: KassalProduct[] }>("/products", { search: term, store, size });
  return r.data;
}

export async function nearbyStores(group: string, lat: number, lng: number, km: number) {
  const r = await get<{ data: KassalStore[] }>("/physical-stores", { group, lat, lng, km, size: 100 });
  return r.data;
}

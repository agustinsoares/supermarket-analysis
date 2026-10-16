// Casa: Solheim Nord, Bergen (aprox.)
export const HOME = { lat: 60.3655, lng: 5.357 };
export const STORE_RADIUS_KM = 3;

// Cadenas que usamos. `code` es el valor del filtro `store` de Kassalapp.
// Kassalapp no tiene precios de COOP_EXTRA; usamos COOP_NO (tienda online de Coop) como referencia.
export const CHAINS = [
  { code: "REMA_1000", label: "Rema 1000", storeGroup: "REMA_1000" },
  { code: "KIWI", label: "Kiwi", storeGroup: "KIWI" },
  { code: "COOP_NO", label: "Coop (nett, ref. Extra)", storeGroup: "COOP_EXTRA" },
] as const;

export type ChainCode = (typeof CHAINS)[number]["code"];

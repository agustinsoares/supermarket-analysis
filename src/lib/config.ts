// Casa: Solheim Nord, Bergen (aprox.)
export const HOME = { lat: 60.3655, lng: 5.357 };
export const STORE_RADIUS_KM = 3;

export type Chain = {
  code: "REMA_1000" | "KIWI" | "EXTRA" | "COOP_NO";
  label: string;
  short: string;
  color: string;
  /** Grupo de Kassalapp para buscar tiendas físicas (null = no aplica). */
  storeGroup: string | null;
  /** Se sincroniza con la API de Kassalapp (filtro `store`). */
  auto: boolean;
  /** Se puede elegir al añadir un producto a mano o subir un folleto. */
  manual: boolean;
};

// Kassalapp no tiene precios de Extra; usamos COOP_NO (tienda online de Coop) solo como referencia.
// Los precios de Extra se cargan a mano o desde folletos.
export const CHAINS: readonly Chain[] = [
  { code: "REMA_1000", label: "Rema 1000", short: "Rema", color: "#1d4fd8", storeGroup: "REMA_1000", auto: true, manual: true },
  { code: "KIWI", label: "Kiwi", short: "Kiwi", color: "#2f9a1b", storeGroup: "KIWI", auto: true, manual: true },
  { code: "EXTRA", label: "Extra", short: "Extra", color: "#d92b2b", storeGroup: "COOP_EXTRA", auto: false, manual: true },
  { code: "COOP_NO", label: "Coop online (ref.)", short: "Coop nett", color: "#7a7a74", storeGroup: null, auto: true, manual: false },
];

export type ChainCode = Chain["code"];
export const CHAIN_BY_CODE = new Map(CHAINS.map((c) => [c.code, c]));
export const MANUAL_CHAINS = CHAINS.filter((c) => c.manual);
export const AUTO_CHAINS = CHAINS.filter((c) => c.auto);
export const STORE_CHAINS = CHAINS.filter((c) => c.storeGroup && c.code !== "COOP_NO");

export const CATEGORIES = [
  "Lácteos y huevos",
  "Carne y aves",
  "Pescado y marisco",
  "Frutas y verduras",
  "Pan y bollería",
  "Despensa",
  "Congelados",
  "Bebidas",
  "Snacks y dulces",
  "Hogar y limpieza",
  "Higiene y cuidado personal",
  "Otros",
] as const;

export const SOURCE_LABEL: Record<string, string> = {
  kassalapp: "Kassalapp",
  manual: "Manual",
  flyer: "Folleto",
};

import { z } from "zod";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  brand: z.preprocess(emptyToNull, z.string().trim().max(100).nullable()).optional(),
  price: z.number({ error: "El precio debe ser un número" }).finite().min(0, "El precio no puede ser negativo").max(100000),
  chain: z.enum(["REMA_1000", "KIWI", "EXTRA", "COOP_NO"]),
  grams: z.preprocess(emptyToNull, z.number().int("Los gramos deben ser un número entero").min(1).max(1000000).nullable()).optional(),
  category: z.string().trim().min(1, "Elige una categoría").max(80),
  image: z.preprocess(emptyToNull, z.string().url().max(1000).nullable()).optional(),
  notes: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()).optional(),
  valid_from: z.preprocess(emptyToNull, z.iso.date().nullable()).optional(),
  valid_to: z.preprocess(emptyToNull, z.iso.date().nullable()).optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

/** Precio por kg a partir del precio y los gramos del envase. */
export function pricePerKg(price: number, grams: number | null | undefined): number | null {
  return grams && grams > 0 ? Math.round((price / grams) * 1000 * 100) / 100 : null;
}

export function toRow(p: ProductInput) {
  return {
    name: p.name,
    brand: p.brand ?? null,
    chain: p.chain,
    category: p.category,
    grams: p.grams ?? null,
    image: p.image ?? null,
    notes: p.notes ?? null,
    valid_from: p.valid_from ?? null,
    valid_to: p.valid_to ?? null,
    current_price: p.price,
    current_unit_price: pricePerKg(p.price, p.grams),
    price_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export type ItemRow = {
  id: number;
  chain: "REMA_1000" | "KIWI" | "EXTRA" | "COOP_NO";
  ean: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  image: string | null;
  grams: number | null;
  current_price: number | null;
  current_unit_price: number | null;
  source: "kassalapp" | "manual" | "flyer";
  status: "active" | "draft";
  notes: string | null;
  valid_from: string | null;
  valid_to: string | null;
  flyer_id: number | null;
  price_updated_at: string | null;
};

export const ITEM_COLUMNS =
  "id,chain,ean,name,brand,category,image,grams,current_price,current_unit_price,source,status,notes,valid_from,valid_to,flyer_id,price_updated_at";

import { z } from "zod";

export const UNITS = ["", "g", "kg", "ml", "dl", "l", "cda", "cdta", "ud"] as const;
export const UNIT_LABEL: Record<string, string> = {
  "": "—", g: "g", kg: "kg", ml: "ml", dl: "dl", l: "l", cda: "cda.", cdta: "cdta.", ud: "ud.",
};

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const numOrNull = z.preprocess(emptyToNull, z.number().finite().min(0).max(1_000_000).nullable());
const unit = z.preprocess(emptyToNull, z.enum(UNITS).nullable());
const text = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());

export const pantrySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  quantity: numOrNull.optional(),
  unit: unit.optional(),
  expires_on: z.preprocess(emptyToNull, z.iso.date().nullable()).optional(),
  notes: text(300).optional(),
});

export const shoppingSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(160),
  quantity: z.number().finite().gt(0, "La cantidad debe ser mayor que 0").max(1000).default(1),
  note: text(200).optional(),
  item_ref: z.number().int().positive().nullable().optional(),
});

export const recipeSchema = z.object({
  title: z.string().trim().min(1, "Pon un título").max(160),
  servings: z.preprocess(emptyToNull, z.number().int().min(1).max(100).nullable()).optional(),
  source_url: z.preprocess(emptyToNull, z.string().url("La URL no es válida").max(500).nullable()).optional(),
  steps: text(20000).optional(),
  notes: text(1000).optional(),
  ingredients: z
    .array(z.object({ name: z.string().trim().min(1, "Falta el nombre de un ingrediente").max(120), quantity: numOrNull.optional(), unit: unit.optional() }))
    .min(1, "Añade al menos un ingrediente")
    .max(80),
});

export type Recipe = {
  id: number; title: string; servings: number | null; source_url: string | null; steps: string | null; notes: string | null;
  ingredients: { id: number; position: number; name: string; quantity: number | null; unit: string | null }[];
};

export const formatQty = (q: number | null, u: string | null) =>
  q == null || q === 0 ? "" : `${Number.isInteger(q) ? q : q.toLocaleString("es", { maximumFractionDigits: 2 })}${u ? ` ${UNIT_LABEL[u] ?? u}` : ""}`;

export const errMsg = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".") || "datos"}: ${i.message}`).join("; ");

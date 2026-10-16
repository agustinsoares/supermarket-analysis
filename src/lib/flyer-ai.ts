import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { CATEGORIES } from "./config";
import { pricePerKg } from "./product";
import { downloadFromBucket, FLYER_BUCKET } from "./storage";
import { db } from "./supabase";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const PDF_PAGES_PER_UNIT = 3;

type FlyerFile = { path: string; mime: string; name?: string };
type Unit =
  | { file: number; kind: "image" }
  | { file: number; kind: "pdf"; from: number; to: number }; // páginas base 0, [from, to)

const FlyerProduct = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  price: z.number(),
  grams: z.number().nullable(),
  category: z.string(), // el SDK no convierte z.enum en restricción: se normaliza en el servidor
  notes: z.string().nullable(),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
});
const FlyerExtraction = z.object({ products: z.array(FlyerProduct) });

const SYSTEM = `Eres un asistente que lee folletos de supermercados noruegos (Rema 1000, Kiwi, Coop Extra) y extrae las ofertas como datos.

Reglas:
- Extrae solo productos con un precio claro en NOK (kr). Ignora recetas, publicidad, textos legales y productos sin precio.
- name: nombre del producto tal como aparece, sin la marca si va aparte y sin el tamaño. brand: marca (null si no hay).
- price: lo que paga el cliente por UNA unidad del producto, como número (ej. 29.9). Si el folleto da "2 for 50", usa 25 y anótalo en notes. Si la oferta es solo para miembros o con la app (Trumf, Coop-medlem, REMA-appen), anótalo en notes.
- grams: peso o volumen del envase en gramos (1 kg = 1000, 1 L = 1000, 1 dl = 100, 1 stk de peso desconocido = null). Si el precio es por kilo sin envase fijo, grams = 1000 y notes = "pris per kg".
- category: elige exactamente una de estas categorías: ${CATEGORIES.join(" | ")}. Si ninguna encaja, "Otros".
- valid_from / valid_to: fechas YYYY-MM-DD solo si el folleto las indica para ese producto o para la página; si no, null.
- No inventes datos. Si un dato no se ve, usa null. Si hay dudas sobre el precio, omite el producto.`;

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY en las variables de entorno");
  return new Anthropic();
}

async function buildPlan(files: FlyerFile[]): Promise<Unit[]> {
  const units: Unit[] = [];
  for (let i = 0; i < files.length; i++) {
    if (files[i].mime === "application/pdf") {
      const pdf = await PDFDocument.load(await downloadFromBucket(FLYER_BUCKET, files[i].path), { ignoreEncryption: true });
      const n = pdf.getPageCount();
      for (let from = 0; from < n; from += PDF_PAGES_PER_UNIT) {
        units.push({ file: i, kind: "pdf", from, to: Math.min(from + PDF_PAGES_PER_UNIT, n) });
      }
    } else {
      units.push({ file: i, kind: "image" });
    }
  }
  return units;
}

async function unitContent(file: FlyerFile, unit: Unit): Promise<Anthropic.Beta.Messages.BetaContentBlockParam> {
  const bytes = await downloadFromBucket(FLYER_BUCKET, file.path);
  if (unit.kind === "pdf") {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, Array.from({ length: unit.to - unit.from }, (_, k) => unit.from + k));
    pages.forEach((p) => out.addPage(p));
    const data = Buffer.from(await out.save()).toString("base64");
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: file.mime as "image/jpeg" | "image/png" | "image/webp", data: bytes.toString("base64") },
  };
}

async function extractUnit(content: Anthropic.Beta.Messages.BetaContentBlockParam, context: string) {
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(FlyerExtraction) },
    messages: [
      { role: "user", content: [content, { type: "text", text: `${context}\n\nExtrae todos los productos con precio de estas páginas.` }] },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude rechazó leer esta página");
  if (!res.parsed_output) throw new Error(`Respuesta incompleta (${res.stop_reason}); prueba con menos páginas`);
  return res.parsed_output.products;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeCategory(raw: string): string {
  const k = raw.trim().toLowerCase();
  return CATEGORIES.find((c) => c.toLowerCase() === k) ?? "Otros";
}

/**
 * Lee el folleto unidad a unidad (3 páginas de PDF o 1 imagen) y guarda los productos como borrador.
 * Es reanudable: cada unidad terminada se registra en `units_done`.
 */
export async function analyzeFlyer(flyerId: number) {
  const sb = db();
  const touch = (patch: Record<string, unknown>) =>
    sb.from("flyers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", flyerId);

  try {
    const { data: flyer, error } = await sb.from("flyers").select("*").eq("id", flyerId).single();
    if (error || !flyer) throw new Error(error?.message ?? "Folleto no encontrado");
    const files = flyer.files as FlyerFile[];

    let plan = flyer.plan as Unit[] | null;
    let done = flyer.units_done as number;
    let found = flyer.items_found as number;
    if (!plan) {
      plan = await buildPlan(files);
      done = 0;
      found = 0;
      await sb.from("items").delete().eq("flyer_id", flyerId).eq("status", "draft");
      await touch({ plan, units_total: plan.length, units_done: 0, items_found: 0, error: null, status: "analyzing" });
    } else {
      await touch({ status: "analyzing", error: null });
    }

    const context = `Supermercado: ${flyer.chain}. Folleto: "${flyer.title}"` +
      (flyer.valid_from || flyer.valid_to ? `. Vigencia: ${flyer.valid_from ?? "?"} a ${flyer.valid_to ?? "?"}.` : ".");

    for (let i = done; i < plan.length; i++) {
      const unit = plan[i];
      const products = await extractUnit(await unitContent(files[unit.file], unit), context);

      const seen = new Set<string>();
      const rows = products
        .filter((p) => p.name.trim() && p.price > 0 && p.price < 5000)
        .filter((p) => {
          const k = `${p.name.toLowerCase()}|${p.price}`;
          return seen.has(k) ? false : (seen.add(k), true);
        })
        .map((p) => {
          const grams = p.grams && p.grams > 0 ? Math.round(p.grams) : null;
          return {
            chain: flyer.chain,
            name: p.name.trim().slice(0, 200),
            brand: p.brand?.trim().slice(0, 100) || null,
            category: normalizeCategory(p.category),
            grams,
            current_price: p.price,
            current_unit_price: pricePerKg(p.price, grams),
            notes: p.notes?.trim().slice(0, 300) || null,
            valid_from: p.valid_from && DATE.test(p.valid_from) ? p.valid_from : flyer.valid_from,
            valid_to: p.valid_to && DATE.test(p.valid_to) ? p.valid_to : flyer.valid_to,
            source: "flyer",
            status: "draft",
            flyer_id: flyerId,
            price_updated_at: new Date().toISOString(),
          };
        });

      if (rows.length) {
        const { error: insErr } = await sb.from("items").insert(rows);
        if (insErr) throw new Error(insErr.message);
      }
      found += rows.length;
      await touch({ units_done: i + 1, items_found: found });
    }
    await touch({ status: "review" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await sb.from("flyers").update({ status: "error", error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", flyerId);
  }
}

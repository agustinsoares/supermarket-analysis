import { PDFDocument } from "pdf-lib";
import { CATEGORIES } from "./config";
import { cropToWebp, normalizeImage, validBox } from "./crop";
import { cropsEnabled, extractProducts, type Doc } from "./llm";
import { pricePerKg } from "./product";
import { downloadFromBucket, FLYER_BUCKET, removeProductImages, uploadProductImage } from "./storage";
import { db } from "./supabase";

const PDF_PAGES_PER_UNIT = 3;

type FlyerFile = { path: string; mime: string; name?: string };
type Unit =
  | { file: number; kind: "image" }
  | { file: number; kind: "pdf"; from: number; to: number }; // páginas base 0, [from, to)

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

/** `raster` es la imagen exacta que ve la IA (solo imágenes, no PDF): de ahí salen los recortes. */
async function loadUnit(file: FlyerFile, unit: Unit): Promise<{ doc: Doc; raster: Buffer | null }> {
  const bytes = await downloadFromBucket(FLYER_BUCKET, file.path);
  if (unit.kind === "pdf") {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, Array.from({ length: unit.to - unit.from }, (_, k) => unit.from + k));
    pages.forEach((p) => out.addPage(p));
    return { doc: { mime: "application/pdf", base64: Buffer.from(await out.save()).toString("base64") }, raster: null };
  }
  const raster = await normalizeImage(bytes);
  return { doc: { mime: file.mime, base64: raster.toString("base64") }, raster };
}

/** Recorta y sube la foto de cada producto (máx. 6 a la vez). Un recorte fallido no detiene el análisis. */
async function cropAll(raster: Buffer, boxes: (number[] | undefined)[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(boxes.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < boxes.length) {
      const i = next++;
      try {
        const box = validBox(boxes[i]);
        const webp = box ? await cropToWebp(raster, box) : null;
        out[i] = webp ? await uploadProductImage(webp) : null;
      } catch {
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, boxes.length) }, worker));
  return out;
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
      const { data: old } = await sb.from("items").select("image").eq("flyer_id", flyerId).eq("status", "draft");
      await sb.from("items").delete().eq("flyer_id", flyerId).eq("status", "draft");
      await removeProductImages((old ?? []).map((r) => r.image as string | null));
      await touch({ plan, units_total: plan.length, units_done: 0, items_found: 0, error: null, status: "analyzing" });
    } else {
      await touch({ status: "analyzing", error: null });
    }

    const context = `Supermercado: ${flyer.chain}. Folleto: "${flyer.title}"` +
      (flyer.valid_from || flyer.valid_to ? `. Vigencia: ${flyer.valid_from ?? "?"} a ${flyer.valid_to ?? "?"}.` : ".");

    for (let i = done; i < plan.length; i++) {
      const unit = plan[i];
      const { doc, raster } = await loadUnit(files[unit.file], unit);
      const crops = !!raster && cropsEnabled();
      const products = await extractProducts(doc, context, crops);

      const seen = new Set<string>();
      const kept = products
        .filter((p) => p.name.trim() && p.price > 0 && p.price < 5000)
        .filter((p) => {
          const k = `${p.name.toLowerCase()}|${p.price}`;
          return seen.has(k) ? false : (seen.add(k), true);
        });

      const images = crops && raster ? await cropAll(raster, kept.map((p) => p.box_2d)) : kept.map(() => null);
      const rows = kept
        .map((p, idx) => {
          const grams = p.grams > 0 ? Math.round(p.grams) : null;
          const date = (v: string) => (DATE.test(v) ? v : null);
          return {
            chain: flyer.chain,
            name: p.name.trim().slice(0, 200),
            brand: p.brand.trim().slice(0, 100) || null,
            category: normalizeCategory(p.category),
            image: images[idx],
            grams,
            current_price: p.price,
            current_unit_price: pricePerKg(p.price, grams),
            notes: p.notes.trim().slice(0, 300) || null,
            valid_from: date(p.valid_from) ?? flyer.valid_from,
            valid_to: date(p.valid_to) ?? flyer.valid_to,
            source: "flyer",
            status: "draft",
            flyer_id: flyerId,
            price_updated_at: new Date().toISOString(),
          };
        });

      if (rows.length) {
        const { error: insErr } = await sb.from("items").insert(rows);
        if (insErr) {
          await removeProductImages(images); // no dejar recortes huérfanos
          throw new Error(insErr.message);
        }
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

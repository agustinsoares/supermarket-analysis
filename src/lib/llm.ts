import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { CATEGORIES } from "./config";

export type Provider = "gemini" | "anthropic";
export type Doc = { mime: string; base64: string };

/**
 * Proveedor de IA para leer folletos. LLM_PROVIDER lo fuerza; si no, se usa el que tenga clave
 * (Gemini primero). Modelo: GEMINI_MODEL / ANTHROPIC_MODEL.
 */
export function activeProvider(): { provider: Provider; model: string } | null {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  const provider: Provider | null =
    forced === "gemini" || forced === "anthropic"
      ? forced
      : process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (!provider) return null;
  if (provider === "gemini" && !process.env.GEMINI_API_KEY) return null;
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) return null;
  return {
    provider,
    model: provider === "gemini" ? process.env.GEMINI_MODEL || "gemini-3.8-flash" : process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  };
}

/** Recortar la foto de cada producto: solo con Gemini (da cajas fiables) y si FLYER_CROP no es "off". */
export function cropsEnabled(): boolean {
  return activeProvider()?.provider === "gemini" && (process.env.FLYER_CROP ?? "on") !== "off";
}

export const NO_KEY_MESSAGE = "Falta GEMINI_API_KEY (o ANTHROPIC_API_KEY) en las variables de entorno para usar la IA";

// Esquema deliberadamente simple (sin null ni enum): "" y 0 significan «no consta». Se normaliza en flyer-ai.ts.
const Product = z.object({
  name: z.string(),
  brand: z.string(),
  price: z.number(),
  grams: z.number(),
  category: z.string(),
  notes: z.string(),
  valid_from: z.string(),
  valid_to: z.string(),
  box_2d: z.array(z.number()),
});
const Extraction = z.object({ products: z.array(Product) });
export type RawProduct = z.infer<typeof Product>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, brand: { type: "string" }, price: { type: "number" }, grams: { type: "number" },
          category: { type: "string" }, notes: { type: "string" }, valid_from: { type: "string" }, valid_to: { type: "string" },
          box_2d: { type: "array", items: { type: "number" } },
        },
        required: ["name", "brand", "price", "grams", "category", "notes", "valid_from", "valid_to", "box_2d"],
      },
    },
  },
  required: ["products"],
};

const SYSTEM = `Eres un asistente que lee folletos de supermercados noruegos (Rema 1000, Kiwi, Coop Extra) y extrae las ofertas como datos.

Reglas:
- Extrae solo productos con un precio claro en NOK (kr). Ignora recetas, publicidad, textos legales y productos sin precio.
- name: nombre del producto tal como aparece, sin la marca si va aparte y sin el tamaño. brand: marca ("" si no hay).
- price: lo que paga el cliente por UNA unidad del producto, como número (ej. 29.9). Si el folleto da "2 for 50", usa 25 y anótalo en notes. Si la oferta es solo para miembros o con la app (Trumf, Coop-medlem, REMA-appen), anótalo en notes.
- grams: peso o volumen del envase en gramos (1 kg = 1000, 1 L = 1000, 1 dl = 100). Si no se conoce (por ejemplo "1 stk"), 0. Si el precio es por kilo sin envase fijo, grams = 1000 y notes = "pris per kg".
- category: exactamente una de estas categorías: ${CATEGORIES.join(" | ")}. Si ninguna encaja, "Otros".
- valid_from / valid_to: fechas YYYY-MM-DD solo si el folleto las indica para ese producto o para la página; si no, "".
- notes: condiciones de la oferta ("2 for 50", "med Trumf"…); "" si no hay.
- box_2d: [ymin, xmin, ymax, xmax] normalizado de 0 a 1000 respecto a la imagen, que encierra SOLO la foto del producto (el envase o el producto en sí). Sin el precio, sin textos ni etiquetas, sin sellos y sin otros productos. Si no hay una foto clara del producto o no puedes delimitarla bien, [].
- No inventes datos. Si un dato no se ve, usa "" (texto) o 0 (número). Si hay dudas sobre el precio, omite el producto.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lee los productos de un trozo de folleto (imagen o PDF corto). */
export async function extractProducts(doc: Doc, context: string, wantBoxes = false): Promise<RawProduct[]> {
  const prompt =
    `${context}\n\nExtrae todos los productos con precio de estas páginas.` +
    (wantBoxes ? "" : "\nNo necesito recortes: devuelve box_2d = [] en todos los productos.");
  const r = await runTask({ system: SYSTEM, doc, prompt, jsonSchema: JSON_SCHEMA, zod: Extraction, maxOut: 32000 });
  return r.products;
}

// ---------------------------------------------------------------- Gemini
function geminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    ...(process.env.GEMINI_BASE_URL ? { httpOptions: { baseUrl: process.env.GEMINI_BASE_URL } } : {}),
  });
}

/** Extrae el mensaje legible de un ApiError de Google (que llega como JSON en texto). */
function cleanApiMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    return JSON.parse(raw)?.error?.message ?? raw;
  } catch {
    return raw;
  }
}

/** Segundos de espera que sugiere Google en «Please retry in 17h11m49s» (null si no lo dice). */
function retryDelaySeconds(msg: string): number | null {
  const m = msg.match(/retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i);
  if (!m) return null;
  const secs = (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
  return secs > 0 ? secs : null;
}

const humanWait = (secs: number) => (secs >= 3600 ? `${Math.round(secs / 3600)} h` : secs >= 90 ? `${Math.round(secs / 60)} min` : `${Math.round(secs)} s`);

/** Cuota diaria agotada: esperar unos segundos no sirve, hay que parar y avisar. */
function isDailyQuota(msg: string): boolean {
  return /PerDay|per day/i.test(msg) || (retryDelaySeconds(msg) ?? 0) > 120;
}

function quotaError(model: string, msg: string): Error {
  const limit = msg.match(/limit:\s*(\d+)/)?.[1];
  const wait = retryDelaySeconds(msg);
  return new Error(
    `Cuota gratuita de Gemini agotada para «${model}»${limit ? ` (límite: ${limit} peticiones)` : ""}` +
      `${wait ? `; se renueva en ~${humanWait(wait)}` : ""}. ` +
      `Opciones: esperar y pulsar «Reanudar», activar facturación en Google AI Studio, probar otro modelo en GEMINI_MODEL, o usar ANTHROPIC_API_KEY.`,
  );
}

/** Convierte un error de Gemini en uno útil; si el modelo no existe, lista los que sí tiene tu clave. */
async function geminiFailure(e: unknown, model: string): Promise<Error> {
  const msg = cleanApiMessage(e);
  if (e instanceof ApiError && e.status === 429 && isDailyQuota(msg)) return quotaError(model, msg);
  if (e instanceof ApiError && e.status === 404) {
    let hint = "";
    try {
      const names: string[] = [];
      let seen = 0;
      for await (const m of await geminiClient().models.list()) {
        if (++seen > 300) break;
        const n = (m.name ?? "").replace(/^models\//, "");
        const usable = /^gemini-\d/.test(n) && !/(tts|image|embedding|live|audio|robotics|computer)/.test(n);
        if (usable && (m.supportedActions ?? []).includes("generateContent")) names.push(n);
      }
      if (names.length) hint = ` Modelos disponibles con tu clave: ${names.slice(0, 8).join(", ")}. Pon uno en GEMINI_MODEL (Vercel) y redespliega.`;
    } catch {
      /* sin lista: nos quedamos con el mensaje de Google */
    }
    return new Error(`El modelo «${model}» no está disponible. ${msg}${hint}`.slice(0, 480));
  }
  return new Error(msg.slice(0, 400));
}

// ---------------------------------------------------------------- tareas estructuradas (Gemini o Claude)
type Task<T> = {
  system: string;
  doc?: Doc; // imagen o PDF opcional; si no hay, solo texto
  prompt: string;
  jsonSchema: object;
  zod: z.ZodType<T>;
  maxOut: number;
};

async function runTask<T>(task: Task<T>): Promise<T> {
  const active = activeProvider();
  if (!active) throw new Error(NO_KEY_MESSAGE);
  return active.provider === "gemini" ? geminiTask(active.model, task) : claudeTask(active.model, task);
}

async function geminiTask<T>(model: string, t: Task<T>): Promise<T> {
  const ai = geminiClient();
  const parts = [...(t.doc ? [{ inlineData: { mimeType: t.doc.mime, data: t.doc.base64 } }] : []), { text: t.prompt }];
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { systemInstruction: t.system, responseMimeType: "application/json", responseJsonSchema: t.jsonSchema, maxOutputTokens: t.maxOut },
      });
      const block = res.promptFeedback?.blockReason;
      if (block) throw new Error(`Gemini bloqueó la petición (${block})`);
      const finish = res.candidates?.[0]?.finishReason;
      if (finish && finish !== "STOP") throw new Error(`Gemini terminó con ${finish}; prueba con menos contenido`);
      return parse(res.text, t.zod);
    } catch (e) {
      // Límite de peticiones o sobrecarga: reintenta con espera (cuota gratuita baja).
      if (!(e instanceof ApiError)) throw e;
      const msg = cleanApiMessage(e);
      const retryable = (e.status === 429 && !isDailyQuota(msg)) || e.status === 503;
      if (!retryable || attempt >= 4) throw await geminiFailure(e, model);
      const wait = retryDelaySeconds(msg);
      await sleep(Math.min(wait ? wait + 1 : attempt * 20, 90) * 1000);
    }
  }
}

async function claudeTask<T>(model: string, t: Task<T>): Promise<T> {
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  if (t.doc) {
    content.push(
      t.doc.mime === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: t.doc.base64 } }
        : { type: "image", source: { type: "base64", media_type: t.doc.mime as "image/jpeg" | "image/png" | "image/webp", data: t.doc.base64 } },
    );
  }
  content.push({ type: "text", text: t.prompt });

  const res = await new Anthropic().beta.messages.parse({
    model,
    max_tokens: Math.min(t.maxOut, 16000),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: t.system,
    output_config: { effort: "medium", format: zodOutputFormat(t.zod) },
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude rechazó la petición");
  if (!res.parsed_output) throw new Error(`Respuesta incompleta (${res.stop_reason}); prueba con menos contenido`);
  return res.parsed_output as T;
}

function parse<T>(text: string | undefined, schema: z.ZodType<T>): T {
  if (!text) throw new Error("La IA no devolvió texto");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("La IA devolvió JSON inválido");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new Error(`Respuesta con formato inesperado: ${r.error.issues[0]?.message ?? "?"}`);
  return r.data;
}

// ---------------------------------------------------------------- recetas
const RECIPE_SYSTEM = `Eres un asistente que convierte el texto de una receta de cocina en datos estructurados.

Reglas:
- title: nombre de la receta.
- servings: número de raciones o personas (entero); 0 si no se indica.
- ingredients: una entrada por ingrediente. name: solo el ingrediente (sin cantidad ni unidad ni notas como «picado»); quantity: número (0 si no consta, p. ej. «sal al gusto»); unit: una de g, kg, ml, dl, l, cda, cdta, ud o "" si no aplica. Convierte fracciones a decimales (1/2 = 0.5).
- steps: los pasos de preparación, uno por línea, numerados («1. …»). Si el texto no trae pasos, "".
- Mantén el idioma original del texto en los nombres. No inventes ingredientes ni pasos.`;

const RecipeExtraction = z.object({
  title: z.string(),
  servings: z.number(),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.number(), unit: z.string() })),
  steps: z.string(),
});
export type ExtractedRecipe = z.infer<typeof RecipeExtraction>;

const RECIPE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    servings: { type: "number" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" } },
        required: ["name", "quantity", "unit"],
      },
    },
    steps: { type: "string" },
  },
  required: ["title", "servings", "ingredients", "steps"],
};

/** Convierte el texto pegado de una receta en datos para revisar antes de guardar. */
export function extractRecipe(text: string): Promise<ExtractedRecipe> {
  return runTask({
    system: RECIPE_SYSTEM,
    prompt: `Texto de la receta:\n\n${text.slice(0, 20000)}`,
    jsonSchema: RECIPE_JSON_SCHEMA,
    zod: RecipeExtraction,
    maxOut: 8000,
  });
}

/** Comprobación rápida de clave y modelo (para el botón «Probar IA»). */
export async function pingModel(): Promise<{ provider: Provider; model: string; ok: boolean; error?: string }> {
  const active = activeProvider();
  if (!active) return { provider: "gemini", model: "", ok: false, error: NO_KEY_MESSAGE };
  try {
    if (active.provider === "gemini") {
      const res = await geminiClient().models.generateContent({ model: active.model, contents: "Responde solo: ok", config: { maxOutputTokens: 50 } });
      if (!res.text && !res.candidates?.length) throw new Error("Sin respuesta");
    } else {
      await new Anthropic().messages.create({ model: active.model, max_tokens: 20, messages: [{ role: "user", content: "Responde solo: ok" }] });
    }
    return { ...active, ok: true };
  } catch (e) {
    const error = active.provider === "gemini" && e instanceof ApiError ? (await geminiFailure(e, active.model)).message : e instanceof Error ? e.message.slice(0, 300) : String(e);
    return { ...active, ok: false, error };
  }
}

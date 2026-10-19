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

export const NO_KEY_MESSAGE = "Falta GEMINI_API_KEY (o ANTHROPIC_API_KEY) en las variables de entorno para leer folletos";

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
        },
        required: ["name", "brand", "price", "grams", "category", "notes", "valid_from", "valid_to"],
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
- No inventes datos. Si un dato no se ve, usa "" (texto) o 0 (número). Si hay dudas sobre el precio, omite el producto.`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lee los productos de un trozo de folleto (imagen o PDF corto). */
export async function extractProducts(doc: Doc, context: string): Promise<RawProduct[]> {
  const active = activeProvider();
  if (!active) throw new Error(NO_KEY_MESSAGE);
  const prompt = `${context}\n\nExtrae todos los productos con precio de estas páginas.`;
  return active.provider === "gemini" ? viaGemini(active.model, doc, prompt) : viaClaude(active.model, doc, prompt);
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

/** Convierte un error de Gemini en uno útil; si el modelo no existe, lista los que sí tiene tu clave. */
async function geminiFailure(e: unknown, model: string): Promise<Error> {
  const msg = cleanApiMessage(e);
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

async function viaGemini(model: string, doc: Doc, prompt: string): Promise<RawProduct[]> {
  const ai = geminiClient();
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: doc.mime, data: doc.base64 } }, { text: prompt }] }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseJsonSchema: JSON_SCHEMA,
          maxOutputTokens: 32000,
        },
      });
      const block = res.promptFeedback?.blockReason;
      if (block) throw new Error(`Gemini bloqueó la petición (${block})`);
      const finish = res.candidates?.[0]?.finishReason;
      if (finish && finish !== "STOP") throw new Error(`Gemini terminó con ${finish}; prueba con menos páginas`);
      return parse(res.text);
    } catch (e) {
      // Límite de peticiones o sobrecarga: reintenta con espera (cuota gratuita baja).
      const retryable = e instanceof ApiError && (e.status === 429 || e.status === 503);
      if (!retryable || attempt >= 4) throw e instanceof ApiError ? await geminiFailure(e, model) : e;
      await sleep(attempt * 20_000);
    }
  }
}

// ---------------------------------------------------------------- Claude
async function viaClaude(model: string, doc: Doc, prompt: string): Promise<RawProduct[]> {
  const content: Anthropic.Beta.Messages.BetaContentBlockParam =
    doc.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } }
      : { type: "image", source: { type: "base64", media_type: doc.mime as "image/jpeg" | "image/png" | "image/webp", data: doc.base64 } };

  const res = await new Anthropic().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "medium", format: zodOutputFormat(Extraction) },
    messages: [{ role: "user", content: [content, { type: "text", text: prompt }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude rechazó leer esta página");
  if (!res.parsed_output) throw new Error(`Respuesta incompleta (${res.stop_reason}); prueba con menos páginas`);
  return res.parsed_output.products;
}

function parse(text: string | undefined): RawProduct[] {
  if (!text) throw new Error("La IA no devolvió texto");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("La IA devolvió JSON inválido");
  }
  const r = Extraction.safeParse(json);
  if (!r.success) throw new Error(`Respuesta con formato inesperado: ${r.error.issues[0]?.message ?? "?"}`);
  return r.data.products;
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

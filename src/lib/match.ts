// Comparación de nombres de ingredientes y productos («leche» ~ «Leche entera 1 l»).
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "en", "para", "un", "una", "og", "med", "til", "the"]);

export const strip = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Formas posibles de una palabra sin plural: «tomates» -> tomates, tomate, tomat; «huevos» -> huevos, huevo. */
function variants(t: string): string[] {
  const v = [t];
  if (t.length > 3 && t.endsWith("s")) v.push(t.slice(0, -1));
  if (t.length > 4 && t.endsWith("es")) v.push(t.slice(0, -2));
  return v;
}

function words(s: string): string[] {
  return strip(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
}

const sameWord = (a: string, b: string) => variants(a).some((x) => variants(b).includes(x));

/** ¿Es el mismo ingrediente? Todas las palabras de uno deben estar en el otro (en cualquier dirección). */
export function sameIngredient(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return false;
  return wa.every((x) => wb.some((y) => sameWord(x, y))) || wb.every((y) => wa.some((x) => sameWord(x, y)));
}

/** Clave para detectar duplicados exactos («Huevos» = «huevo»). */
export const normalizeName = (s: string) =>
  words(s)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .sort()
    .join(" ");

// Sesión por cookie firmada (HMAC). Compatible con Edge (middleware) y Node: solo usa Web Crypto.
// La firma usa SYNC_SECRET: cambiarla cierra todas las sesiones.
export const COOKIE = "sa_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 días

const enc = new TextEncoder();

const toB64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toB64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Crea el valor de la cookie: payload.firma (el nombre de usuario va en el payload; solo ASCII). */
export async function createSession(secret: string, username: string): Promise<string> {
  const payload = toB64Url(enc.encode(JSON.stringify({ u: username, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  return `${payload}.${await sign(secret, payload)}`;
}

function decodePayload(token: string): { u: string; exp: number } | null {
  try {
    const b64 = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
    return typeof json.u === "string" && typeof json.exp === "number" ? json : null;
  } catch {
    return null;
  }
}

/** Devuelve el usuario si la firma es válida y no ha caducado. */
export async function verifySession(token: string | null | undefined, secret: string): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, await sign(secret, payload))) return null;
  const data = decodePayload(token);
  return data && data.exp > Date.now() / 1000 ? data.u : null;
}

/** Solo para mostrar el nombre en pantalla (el middleware ya verificó la firma). */
export function usernameFromCookie(token: string | undefined): string | null {
  return token ? (decodePayload(token)?.u ?? null) : null;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Válido con sesión de usuario o con `Authorization: Bearer <SYNC_SECRET>` (para automatizar la API). */
export async function isAuthenticated(req: Request): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && safeEqual(bearer, secret)) return true;

  return !!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret));
}

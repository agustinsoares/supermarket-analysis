// Sesión por cookie. Compatible con el runtime Edge (middleware) y Node: solo usa Web Crypto.
export const COOKIE = "sa_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionValue(secret: string) {
  return hmacHex(secret, "supermarket-analysis:session:v1");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Válido si lleva la cookie de sesión o `Authorization: Bearer <SYNC_SECRET>`. */
export async function isAuthenticated(req: Request): Promise<boolean> {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return false;

  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && safeEqual(bearer, secret)) return true;

  const cookie = readCookie(req.headers.get("cookie"), COOKIE);
  return !!cookie && safeEqual(cookie, await sessionValue(secret));
}

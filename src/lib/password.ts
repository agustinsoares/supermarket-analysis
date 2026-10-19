import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// scrypt (incluido en Node): lento a propósito y con sal aleatoria, a diferencia de MD5.
// Formato guardado: scrypt$N$r$p$sal(base64)$hash(base64)
const N = 16384, R = 8, P = 1, KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword("relleno-sin-uso"));

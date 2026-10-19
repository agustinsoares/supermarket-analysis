// Uso: node scripts/hash-password.mjs <usuario> <contraseña>
// Imprime el SQL para crear (o cambiar la contraseña de) un usuario. Pégalo en el SQL Editor de Supabase.
import { randomBytes, scrypt } from "node:crypto";

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Uso: npm run user:sql -- <usuario> <contraseña>");
  process.exit(1);
}
const user = username.trim().toLowerCase();
if (!/^[a-z0-9._-]{3,50}$/.test(user)) {
  console.error("El usuario debe tener 3-50 caracteres: letras minúsculas, números, punto, guion o guion bajo.");
  process.exit(1);
}

// Mismos parámetros que src/lib/password.ts
const N = 16384, R = 8, P = 1, KEYLEN = 64;
const salt = randomBytes(16);
scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (err, key) => {
  if (err) throw err;
  const hash = `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
  console.log(
    `insert into app_users (username, password_hash) values ('${user}', '${hash}')\n` +
      `on conflict (username) do update set password_hash = excluded.password_hash;`,
  );
});

import { NextResponse } from "next/server";
import { dummyHash, verifyPassword } from "@/lib/password";
import { COOKIE, createSession, SESSION_MAX_AGE } from "@/lib/session";
import { db } from "@/lib/supabase";

const USER_RE = /^[a-z0-9._-]{3,50}$/;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_USER = 8;
const MAX_FAILS_IP = 20;

const fail = async (status: number, error: string) => {
  await new Promise((r) => setTimeout(r, 500)); // frena el ensayo y error
  return NextResponse.json({ error }, { status });
};

export async function POST(req: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "SYNC_SECRET no está configurada en el servidor (se usa para firmar sesiones)" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username || !password) return fail(400, "Introduce usuario y contraseña");
  if (!USER_RE.test(username) || password.length > 200) return fail(401, "Usuario o contraseña incorrectos");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida";
  const sb = db();

  try {
    // Límite de intentos fallidos en los últimos 15 minutos, por usuario y por IP.
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const [byUser, byIp] = await Promise.all([
      sb.from("login_attempts").select("id", { count: "exact", head: true }).eq("ok", false).eq("username", username).gte("at", since),
      sb.from("login_attempts").select("id", { count: "exact", head: true }).eq("ok", false).eq("ip", ip).gte("at", since),
    ]);
    if ((byUser.count ?? 0) >= MAX_FAILS_USER || (byIp.count ?? 0) >= MAX_FAILS_IP) {
      return fail(429, "Demasiados intentos fallidos. Espera 15 minutos.");
    }

    const { data: user, error } = await sb.from("app_users").select("id,username,password_hash").eq("username", username).maybeSingle();
    if (error) throw error;

    const valid = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
    const ok = !!user && valid;
    await sb.from("login_attempts").insert({ username, ip, ok });
    if (!ok) return fail(401, "Usuario o contraseña incorrectos");

    await sb.from("app_users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
    await sb.from("login_attempts").delete().eq("username", username).eq("ok", false); // los fallos previos no cuentan tras entrar

    const res = NextResponse.json({ ok: true, username });
    res.cookies.set(COOKIE, await createSession(secret, user.username), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: `No se pudo comprobar el acceso: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}

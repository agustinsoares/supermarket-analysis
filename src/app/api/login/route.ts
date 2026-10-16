import { NextResponse } from "next/server";
import { COOKIE, COOKIE_MAX_AGE, safeEqual, sessionValue } from "@/lib/session";

export async function POST(req: Request) {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return NextResponse.json({ error: "SYNC_SECRET no está configurada en el servidor" }, { status: 500 });

  const { secret: given } = (await req.json().catch(() => ({}))) as { secret?: string };
  if (!given || !safeEqual(given, secret)) {
    await new Promise((r) => setTimeout(r, 600)); // frena el ensayo y error
    return NextResponse.json({ error: "Clave incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await sessionValue(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

import { NextResponse } from "next/server";

export const unauthorized = () => NextResponse.json({ error: "No autorizado" }, { status: 401 });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const readJson = (req: Request) => req.json().catch(() => null);
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

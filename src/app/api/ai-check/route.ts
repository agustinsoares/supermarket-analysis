import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { pingModel } from "@/lib/llm";

export const maxDuration = 60;

// Comprueba que la clave y el modelo de IA configurados funcionan.
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await pingModel());
}

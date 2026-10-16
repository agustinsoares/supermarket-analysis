import { NextResponse, after } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { analyzeFlyer } from "@/lib/flyer-ai";
import { db } from "@/lib/supabase";

// El análisis sigue en segundo plano después de responder; la web consulta el progreso.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// POST ?restart=1 vuelve a empezar desde cero; sin él, reanuda donde se quedó.
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en Vercel para que Claude pueda leer folletos" }, { status: 500 });
  }

  const sb = db();
  const { data: flyer } = await sb.from("flyers").select("status,updated_at").eq("id", id).maybeSingle();
  if (!flyer) return NextResponse.json({ error: "Folleto no encontrado" }, { status: 404 });

  // Evita lanzar dos análisis a la vez (un análisis activo actualiza updated_at cada pocos segundos).
  const stale = Date.now() - new Date(flyer.updated_at).getTime() > 3 * 60 * 1000;
  if (flyer.status === "analyzing" && !stale) {
    return NextResponse.json({ error: "Ya se está analizando" }, { status: 409 });
  }
  if (new URL(req.url).searchParams.get("restart")) {
    await sb.from("flyers").update({ plan: null, units_done: 0, units_total: 0, items_found: 0 }).eq("id", id);
  }

  after(() => analyzeFlyer(id));
  return NextResponse.json({ started: true }, { status: 202 });
}

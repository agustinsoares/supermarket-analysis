import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

const createSchema = z.object({
  chain: z.enum(["REMA_1000", "KIWI", "EXTRA"]),
  title: z.string().trim().min(1, "Pon un título").max(120),
  valid_from: z.iso.date().nullable().optional(),
  valid_to: z.iso.date().nullable().optional(),
  files: z
    .array(
      z.object({
        path: z.string().regex(/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/, "Ruta de archivo inválida"),
        mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
        name: z.string().max(200).optional(),
      }),
    )
    .min(1, "Sube al menos un archivo")
    .max(60),
});

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { data, error } = await db()
    .from("flyers")
    .select("id,chain,title,valid_from,valid_to,status,units_total,units_done,items_found,error,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flyers: data });
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const { data, error } = await db()
    .from("flyers")
    .insert({ ...parsed.data, valid_from: parsed.data.valid_from ?? null, valid_to: parsed.data.valid_to ?? null })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}

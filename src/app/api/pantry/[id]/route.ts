import { NextResponse } from "next/server";
import { fail, parseId, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg, pantrySchema } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const p = pantrySchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { error } = await db().from("pantry_items").update({ ...p.data, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const { error } = await db().from("pantry_items").delete().eq("id", id);
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
}

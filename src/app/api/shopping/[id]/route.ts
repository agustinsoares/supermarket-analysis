import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, parseId, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    quantity: z.number().finite().gt(0).max(1000),
    checked: z.boolean(),
    name: z.string().trim().min(1).max(160),
    note: z.string().trim().max(200).nullable(),
    item_ref: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Nada que cambiar");

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const p = patchSchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { error } = await db().from("shopping_items").update(p.data).eq("id", id);
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const { error } = await db().from("shopping_items").delete().eq("id", id);
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
}

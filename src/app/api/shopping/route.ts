import { NextResponse } from "next/server";
import { fail, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg, shoppingSchema } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const p = shoppingSchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { data, error } = await db().from("shopping_items").insert({ ...p.data, note: p.data.note ?? null, item_ref: p.data.item_ref ?? null }).select("id").single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}

// DELETE ?checked=1: quita de la lista lo ya marcado.
export async function DELETE(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  if (!new URL(req.url).searchParams.get("checked")) return fail("Indica ?checked=1");
  const { data, error } = await db().from("shopping_items").delete().eq("checked", true).select("id");
  return error ? fail(error.message, 500) : NextResponse.json({ count: data?.length ?? 0 });
}

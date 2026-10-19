import { NextResponse } from "next/server";
import { fail, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg, pantrySchema } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const p = pantrySchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { data, error } = await db().from("pantry_items").insert(p.data).select("id").single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}

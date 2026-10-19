import PantryView, { type PantryRow } from "@/components/PantryView";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PantryPage() {
  const { data, error } = await db()
    .from("pantry_items")
    .select("id,name,quantity,unit,expires_on,notes")
    .order("expires_on", { ascending: true, nullsFirst: false })
    .order("name");
  if (error) return <div className="card err">No se pudo leer la base de datos: {error.message}</div>;
  return <PantryView items={(data ?? []).map((r) => ({ ...r, quantity: r.quantity == null ? null : Number(r.quantity) })) as PantryRow[]} />;
}

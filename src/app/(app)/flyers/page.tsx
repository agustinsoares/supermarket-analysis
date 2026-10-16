import FlyersView, { type Flyer } from "@/components/FlyersView";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function FlyersPage() {
  const { data, error } = await db()
    .from("flyers")
    .select("id,chain,title,valid_from,valid_to,status,units_total,units_done,items_found,error,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return <div className="card err">No se pudo leer la base de datos: {error.message}</div>;
  return <FlyersView initial={(data ?? []) as Flyer[]} />;
}

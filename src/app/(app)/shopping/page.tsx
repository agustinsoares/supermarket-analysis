import ShoppingView from "@/components/ShoppingView";
import { loadShoppingPlan } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  try {
    return <ShoppingView plan={await loadShoppingPlan()} />;
  } catch (e) {
    return <div className="card err">No se pudo leer la base de datos: {(e as { message?: string })?.message ?? String(e)}</div>;
  }
}

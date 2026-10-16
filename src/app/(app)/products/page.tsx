import ProductsView from "@/components/ProductsView";
import { CATEGORIES, CHAINS, SOURCE_LABEL } from "@/lib/config";
import { ITEM_COLUMNS, type ItemRow } from "@/lib/product";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProductsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).replace(/[,()%_*\\]/g, " ").trim();
  const chain = one(sp.chain);
  const category = one(sp.category);
  const source = one(sp.source);
  const status = one(sp.status) === "draft" ? "draft" : "active";
  const flyer = Number(one(sp.flyer)) || null;

  let items: ItemRow[] = [];
  let error: string | null = null;
  try {
    let query = db().from("items").select(ITEM_COLUMNS).eq("status", status);
    if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%`);
    if (chain) query = query.eq("chain", chain);
    if (category) query = query.eq("category", category);
    if (source) query = query.eq("source", source);
    if (flyer) query = query.eq("flyer_id", flyer);
    const { data, error: e } = await query.order("updated_at", { ascending: false }).limit(200);
    if (e) throw e;
    items = (data ?? []) as ItemRow[];
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="stack">
      <form className="card filters" method="get" action="/products">
        <label className="field">
          <span>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nombre o marca" />
        </label>
        <label className="field">
          <span>Supermercado</span>
          <select name="chain" defaultValue={chain}>
            <option value="">Todos</option>
            {CHAINS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Categoría</span>
          <select name="category" defaultValue={category}>
            <option value="">Todas</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Origen</span>
          <select name="source" defaultValue={source}>
            <option value="">Todos</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Estado</span>
          <select name="status" defaultValue={status}>
            <option value="active">Activos</option>
            <option value="draft">Borradores (por revisar)</option>
          </select>
        </label>
        {flyer && <input type="hidden" name="flyer" value={flyer} />}
        <button className="btn primary">Filtrar</button>
      </form>

      {error ? <div className="card err">No se pudo leer la base de datos: {error}</div>
        : <ProductsView items={items} draftFlyerId={flyer} isDraftView={status === "draft"} />}
    </div>
  );
}

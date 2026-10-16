import SyncPanel from "@/components/SyncPanel";
import { CHAINS } from "@/lib/config";
import { nok } from "@/lib/client";
import { ITEM_COLUMNS, type ItemRow } from "@/lib/product";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function group(items: ItemRow[]) {
  // Mismo EAN = mismo producto en distintas cadenas; sin EAN, mismo nombre normalizado + marca.
  const map = new Map<string, { name: string; byChain: Map<string, ItemRow> }>();
  for (const it of items) {
    const key = it.ean ?? `${norm(it.brand ?? "")}|${norm(it.name)}|${it.grams ?? ""}`;
    const g = map.get(key) ?? { name: it.name, byChain: new Map() };
    const cur = g.byChain.get(it.chain);
    if (!cur || Number(it.current_price) < Number(cur.current_price)) g.byChain.set(it.chain, it);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.byChain.size - a.byChain.size || a.name.localeCompare(b.name));
}

export default async function Home() {
  let terms: string[] = [];
  const sections: { term: string; rows: ReturnType<typeof group> }[] = [];
  const counts = new Map<string, number>();
  let drafts = 0;
  let lastUpdate: string | null = null;
  let error: string | null = null;

  try {
    const sb = db();
    const today = new Date().toISOString().slice(0, 10);

    const { data: t, error: e } = await sb.from("tracked_terms").select("term").order("created_at");
    if (e) throw e;
    terms = (t ?? []).map((r) => r.term);

    for (const c of CHAINS) {
      const { count } = await sb.from("items").select("id", { count: "exact", head: true }).eq("chain", c.code).eq("status", "active");
      counts.set(c.code, count ?? 0);
    }
    const { count: d } = await sb.from("items").select("id", { count: "exact", head: true }).eq("status", "draft");
    drafts = d ?? 0;

    for (const term of terms) {
      const { data } = await sb
        .from("items")
        .select(ITEM_COLUMNS)
        .ilike("name", `%${term.replace(/[%_,()]/g, "")}%`)
        .eq("status", "active")
        .not("current_price", "is", null)
        .or(`valid_to.is.null,valid_to.gte.${today}`) // ofertas caducadas fuera
        .limit(300);
      const items = (data ?? []) as ItemRow[];
      for (const i of items) if (i.price_updated_at && (!lastUpdate || i.price_updated_at > lastUpdate)) lastUpdate = i.price_updated_at;
      sections.push({ term, rows: group(items).slice(0, 40) });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Comparar precios</h1>
          <p className="muted">
            Solheim Nord, Bergen
            {lastUpdate && <> · Último precio: {new Date(lastUpdate).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}</>}
          </p>
        </div>
      </div>

      {error && <div className="card err">No se pudo leer la base de datos: {error}</div>}

      <div className="stats">
        {CHAINS.map((c) => (
          <div className="stat" key={c.code} style={{ "--c": c.color } as React.CSSProperties}>
            <span className="muted">{c.label}</span>
            <b>{counts.get(c.code) ?? 0}</b>
            <span className="muted">productos</span>
          </div>
        ))}
      </div>

      {drafts > 0 && (
        <div className="banner">
          <span>Hay <b>{drafts}</b> productos de folletos pendientes de revisar.</span>
          <a className="btn small" href="/products?status=draft">Revisar</a>
        </div>
      )}

      <SyncPanel terms={terms} />

      {!error && terms.length === 0 && <p className="muted">Añade productos a vigilar (por ejemplo «lettmelk») y pulsa «Actualizar precios».</p>}

      {sections.map(({ term, rows }) => (
        <section key={term} className="cmp">
          <h2>{term}</h2>
          {rows.length === 0 ? (
            <p className="muted">Sin precios todavía.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Producto</th>{CHAINS.map((c) => <th key={c.code}>{c.short}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const prices = [...r.byChain.values()].map((i) => Number(i.current_price));
                    const best = r.byChain.size > 1 ? Math.min(...prices) : null;
                    return (
                      <tr key={r.name + [...r.byChain.keys()].join()}>
                        <td>{r.name}</td>
                        {CHAINS.map((c) => {
                          const it = r.byChain.get(c.code);
                          const p = it ? Number(it.current_price) : null;
                          return (
                            <td key={c.code} className={`price${p !== null && p === best ? " best" : ""}`}>
                              {p === null ? "—" : nok(p)}
                              {it?.current_unit_price ? <small>{nok(Number(it.current_unit_price))}/kg</small> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

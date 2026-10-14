import { CHAINS } from "@/lib/config";
import { db } from "@/lib/supabase";
import SyncPanel from "./SyncPanel";

export const dynamic = "force-dynamic";

type Item = {
  id: number; chain: string; ean: string | null; name: string; brand: string | null;
  current_price: number | null; price_updated_at: string | null;
};

const nok = (n: number) => `${n.toFixed(2).replace(".", ",")} kr`;

function group(items: Item[]) {
  // Mismo EAN = mismo producto en distintas cadenas.
  const map = new Map<string, { name: string; byChain: Map<string, Item> }>();
  for (const it of items) {
    const key = it.ean ?? `${it.chain}:${it.id}`;
    const g = map.get(key) ?? { name: it.name, byChain: new Map() };
    g.byChain.set(it.chain, it);
    map.set(key, g);
  }
  return [...map.values()].sort(
    (a, b) => b.byChain.size - a.byChain.size || a.name.localeCompare(b.name),
  );
}

export default async function Home() {
  let terms: string[] = [];
  const sections: { term: string; rows: ReturnType<typeof group> }[] = [];
  let lastUpdate: string | null = null;
  let error: string | null = null;

  try {
    const sb = db();
    const { data: t, error: e } = await sb.from("tracked_terms").select("term").order("created_at");
    if (e) throw e;
    terms = (t ?? []).map((r) => r.term);

    for (const term of terms) {
      const { data } = await sb
        .from("items")
        .select("id,chain,ean,name,brand,current_price,price_updated_at")
        .ilike("name", `%${term.replace(/[%_]/g, "")}%`)
        .not("current_price", "is", null)
        .limit(300);
      const items = (data ?? []) as Item[];
      for (const i of items) if (i.price_updated_at && (!lastUpdate || i.price_updated_at > lastUpdate)) lastUpdate = i.price_updated_at;
      sections.push({ term, rows: group(items).slice(0, 40) });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main>
      <h1>Supermarket Analysis</h1>
      <p className="muted">
        Rema 1000 · Kiwi · Extra (precios de referencia vía Coop online) — Solheim Nord, Bergen
        {lastUpdate && <> · Última actualización: {new Date(lastUpdate).toLocaleString("nb-NO")}</>}
      </p>

      <SyncPanel terms={terms} />

      {error && <div className="card">No se pudo leer la base de datos: {error}</div>}
      {!error && terms.length === 0 && (
        <p className="muted">Añade productos a vigilar (por ejemplo «lettmelk») y pulsa «Actualizar precios».</p>
      )}

      {sections.map(({ term, rows }) => (
        <section key={term}>
          <h2>{term}</h2>
          {rows.length === 0 ? (
            <p className="muted">Sin precios todavía. Pulsa «Actualizar precios».</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Producto</th>{CHAINS.map((c) => <th key={c.code}>{c.label}</th>)}</tr>
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
    </main>
  );
}

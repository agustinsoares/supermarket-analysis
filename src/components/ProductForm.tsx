"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, resizeImage, uploadToBucket } from "@/lib/client";
import { CATEGORIES, MANUAL_CHAINS } from "@/lib/config";
import type { ItemRow } from "@/lib/product";

type Props = { item?: ItemRow; onClose: () => void };

export default function ProductForm({ item, onClose }: Props) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [price, setPrice] = useState(item?.current_price != null ? String(item.current_price) : "");
  const [chain, setChain] = useState<string>(item?.chain ?? "REMA_1000");
  const [grams, setGrams] = useState(item?.grams != null ? String(item.grams) : "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [validFrom, setValidFrom] = useState(item?.valid_from ?? "");
  const [validTo, setValidTo] = useState(item?.valid_to ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Vista previa local de la imagen elegida.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const categories: string[] = [...CATEGORIES];
  if (category && !categories.includes(category)) categories.unshift(category); // categoría de Kassalapp u otra existente
  // Un producto de Coop online no se puede reasignar a otro supermercado por error.
  const chains = item?.chain === "COOP_NO" ? [{ code: "COOP_NO", label: "Coop online (ref.)" }] : MANUAL_CHAINS;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const priceNum = Number(price.replace(",", "."));
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("El precio debe ser un número válido.");
    if (grams && (!Number.isInteger(Number(grams)) || Number(grams) < 1)) return setError("Los gramos deben ser un número entero.");
    if (validFrom && validTo && validTo < validFrom) return setError("La fecha «hasta» no puede ser anterior a «desde».");

    setBusy(true);
    try {
      let image = imageUrl;
      if (file) {
        const blob = await resizeImage(file, 1000, "image/webp", 0.82);
        image = (await uploadToBucket("product-images", blob)).publicUrl;
      }
      const payload = {
        name, brand, price: priceNum, chain, category,
        grams: grams ? Number(grams) : null,
        image, notes, valid_from: validFrom || null, valid_to: validTo || null,
      };
      if (item) await api(`/api/items/${item.id}`, { method: "PATCH", json: payload });
      else await api("/api/items", { method: "POST", json: payload });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const shownImage = preview ?? imageUrl;

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pf-title">
        <h2 id="pf-title">{item ? "Editar producto" : "Añadir producto"}</h2>

        <div className="form-grid">
          <label className="field full">
            <span>Nombre <small>(texto)</small></span>
            <input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lettmelk 1,0% 1 l" />
          </label>
          <label className="field">
            <span>Marca <small>(texto, opcional)</small></span>
            <input maxLength={100} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Tine" />
          </label>
          <label className="field">
            <span>Supermercado</span>
            <select value={chain} onChange={(e) => setChain(e.target.value)} disabled={item?.chain === "COOP_NO"}>
              {chains.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Precio <small>(número, kr)</small></span>
            <input required type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="24,90" />
          </label>
          <label className="field">
            <span>Gramos <small>(entero, g; 1 l ≈ 1000)</small></span>
            <input type="number" inputMode="numeric" min={1} step={1} value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="1000" />
          </label>
          <label className="field full">
            <span>Categoría</span>
            <select required value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="" disabled>Elige una categoría…</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <div className="field full">
            <span>Imagen <small>(JPG, PNG o WebP; se reduce antes de subir)</small></span>
            <div className="img-pick">
              {shownImage ? <img className="thumb" src={shownImage} alt="" /> : <div className="thumb">Sin imagen</div>}
              <div style={{ flex: 1, display: "grid", gap: 8 }}>
                <input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Imagen del producto"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {shownImage && (
                  <button type="button" className="btn small" onClick={() => { setFile(null); setImageUrl(null); }}>Quitar imagen</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <details style={{ marginTop: 12 }} open={!!(validFrom || validTo || notes)}>
          <summary>Oferta (opcional)</summary>
          <div className="form-grid">
            <label className="field">
              <span>Válido desde <small>(fecha)</small></span>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>Válido hasta <small>(fecha)</small></span>
              <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </label>
            <label className="field full">
              <span>Notas <small>(ej: «2 for 50», «con app»)</small></span>
              <input maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </details>

        {item?.source === "kassalapp" && (
          <p className="muted" style={{ marginTop: 10 }}>Al editar un producto de Kassalapp, la sincronización dejará de actualizarlo.</p>
        )}
        {error && <p className="err" role="alert" style={{ marginTop: 10 }}>{error}</p>}

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : item ? "Guardar cambios" : "Añadir producto"}</button>
        </div>
      </form>
    </div>
  );
}

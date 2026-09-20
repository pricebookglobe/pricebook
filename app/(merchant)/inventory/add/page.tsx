"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import type { StructuredProduct } from "@/lib/aiVision";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export default function AddItemPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState<string | null>(null);
  const [textQuery, setTextQuery] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [product, setProduct] = useState<StructuredProduct | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("JOD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/inventory/add");
        return;
      }
      const res = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await res.json();
      if (!store) {
        router.push("/dashboard");
        return;
      }
      setStoreId(store.id);
      setAccessToken(data.session.access_token);
    });
  }, [router]);

  async function extract(input: { text?: string; imageBase64?: string }) {
    setExtracting(true);
    setError(null);
    setLastImageBase64(input.imageBase64 ?? null);
    try {
      const res = await fetch("/api/products/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProduct(await res.json());
    } catch (e: any) {
      setError(e.message ?? "Couldn't read that product.");
    } finally {
      setExtracting(false);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageBase64 = await fileToBase64(file);
    extract({ imageBase64 });
    e.target.value = "";
  }

  function updateProductField<K extends keyof StructuredProduct>(key: K, value: StructuredProduct[K]) {
    setProduct((p) => (p ? { ...p, [key]: value } : p));
  }

  async function handleSave() {
    if (!product || !storeId || !price) return;
    setSaving(true);
    setError(null);
    try {
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, imageBase64: lastImageBase64 ?? undefined })
      });
      if (!productRes.ok) throw new Error((await productRes.json()).error);
      const { product_id } = await productRes.json();

      const invRes = await fetch(`/api/stores/${storeId}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ product_id, price: parseFloat(price), currency })
      });
      if (!invRes.ok) throw new Error((await invRes.json()).error);

      setSaved(true);
      setProduct(null);
      setPrice("");
      setTextQuery("");
      setLastImageBase64(null);
    } catch (e: any) {
      setError(e.message ?? "Couldn't save this item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPage>
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Add an item")}</h1>
        <p className="mt-1 text-sm text-ash">{t("Describe it, snap it, or upload a photo — then set your price.")}</p>
      </header>

      {!product && (
        <div className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (textQuery.trim()) extract({ text: textQuery.trim() });
            }}
            className="flex items-center gap-2 rounded border border-line bg-field-raised px-3 py-2"
          >
            <input
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder={t("e.g. Al Ain fresh milk 1L")}
              className="flex-1 bg-transparent text-[15px] text-ink placeholder:text-ash outline-none"
              disabled={extracting}
            />
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={extracting}
              className="rounded-sm px-2 py-1 text-sm text-ash hover:text-ink"
            >
              {t("Snap")}
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="rounded-sm px-2 py-1 text-sm text-ash hover:text-ink"
            >
              {t("Upload")}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <button
              type="submit"
              disabled={extracting || !textQuery.trim()}
              className="rounded-sm bg-ink px-4 py-1.5 font-display text-sm font-medium text-field disabled:opacity-40"
            >
              {extracting ? t("Reading…") : t("Identify")}
            </button>
          </form>
          {saved && <p className="text-sm text-value">{t("Saved — add another item, or head back to your dashboard.")}</p>}
        </div>
      )}

      {product && (
        <div className="mt-2 flex flex-col gap-3 rounded border border-line bg-field-raised p-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ash">{t("Confirm the details")}</p>

          <label className="text-sm text-ash">
            {t("Item") /* product name label */}
            <input
              value={product.product_name}
              onChange={(e) => updateProductField("product_name", e.target.value)}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-ash">
              {t("Brand")}
              <input
                value={product.brand ?? ""}
                onChange={(e) => updateProductField("brand", e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              Manufacturer
              <input
                value={product.manufacturer ?? ""}
                onChange={(e) => updateProductField("manufacturer", e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              {t("Category")}
              <input
                value={product.category}
                onChange={(e) => updateProductField("category", e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              {t("Size")}
              <input
                type="number"
                value={product.size ?? ""}
                onChange={(e) => updateProductField("size", e.target.value ? parseFloat(e.target.value) : null)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              {t("Unit")}
              <input
                value={product.unit ?? ""}
                onChange={(e) => updateProductField("unit", e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-ash">
              {t("Price")}
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              {t("Currency")}
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
          </div>

          {error && <p className="text-sm text-flag">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !price}
              className="rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40"
            >
              {saving ? t("Saving…") : t("Save item")}
            </button>
            <button onClick={() => setProduct(null)} className="rounded-sm px-4 py-2 font-display text-sm text-ash">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
    </AppPage>
  );
}

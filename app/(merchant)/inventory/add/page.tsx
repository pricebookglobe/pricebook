"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import type { StructuredProduct, NutritionFacts } from "@/lib/aiVision";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { InPageCamera } from "@/components/shared/InPageCamera";
import { AppPage } from "@/components/shared/AppPage";
import { StatusDots } from "@/components/shared/StatusDots";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { Capacitor } from "@capacitor/core";
import { Camera as CameraIcon } from "lucide-react";

export default function AddItemPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState<string | null>(null);
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [textQuery, setTextQuery] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [product, setProduct] = useState<StructuredProduct | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("JOD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"menu" | "text">("menu");
  const [nutrition, setNutrition] = useState<NutritionFacts | null>(null);
  const [nutritionFromDatabase, setNutritionFromDatabase] = useState(false);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [nutritionError, setNutritionError] = useState<string | null>(null);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showInPageCamera, setShowInPageCamera] = useState(false);

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
        router.push("/overview");
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
      const extracted = await res.json();
      setProduct(extracted);
      // Runs in the background while the merchant sets a price — not
      // awaited, so it doesn't block the confirm screen from appearing.
      // Barcode-scanned items skip this entirely (they already have real
      // label data from extract() never being called for that path).
      lookupNutrition(extracted);
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

  // Used to hand off to Capacitor's Camera plugin (source: Prompt, the
  // native "Take Photo"/"Choose from Gallery" action sheet) in the native
  // app. That hand-off is itself what caused the app to crash/reset when
  // taking a photo — launching the native camera Activity is a
  // memory-heavy transition that Android's low-memory killer can reclaim
  // this app's whole process for, and switching resultType from Base64 to
  // Uri (tried first) only changes what crosses the bridge AFTER a photo
  // is taken, not the transition itself. Snap now opens InPageCamera
  // instead — a getUserMedia feed shown right in this page, same
  // crash-proof approach BarcodeScanner already uses successfully. That
  // does mean Snap here is camera-only now (no more "Choose from
  // Gallery" via the Prompt sheet) — matching how Snap already behaves
  // on Check Price's side.
  function handleSnap() {
    if (!Capacitor.isNativePlatform()) {
      cameraInputRef.current?.click();
      return;
    }
    setShowInPageCamera(true);
  }

  async function handleInPageCapture(file: File) {
    setShowInPageCamera(false);
    const imageBase64 = await fileToBase64(file);
    extract({ imageBase64 });
  }

  async function handleBarcodeDetected(barcode: string) {
    setShowScanner(false);
    setScanningBarcode(true);
    setError(null);
    try {
      const res = await fetch("/api/products/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode })
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }
      if (!data.found) {
        setError(
          t("No information is available in the system for this barcode. Please use Snap or Enter item details instead.") +
            ` (${t("Scanned")}: ${data.scanned_barcode ?? barcode})`
        );
        return;
      }

      setProduct(data.structured);
      setProductImageUrl(data.image_url ?? null);
      setLastImageBase64(null);
      setScannedBarcode(barcode);
      if (data.nutrition_facts) {
        setNutrition(data.nutrition_facts);
        setNutritionFromDatabase(true);
      }
    } catch (e: any) {
      setError(`Barcode lookup failed: ${e?.message ?? String(e)}`);
    } finally {
      setScanningBarcode(false);
    }
  }

  function updateProductField<K extends keyof StructuredProduct>(key: K, value: StructuredProduct[K]) {
    setProduct((p) => (p ? { ...p, [key]: value } : p));
  }

  function updateNutritionField<K extends keyof NutritionFacts>(key: K, value: NutritionFacts[K]) {
    setNutritionFromDatabase(false);
    setNutrition((n) =>
      n ? { ...n, [key]: value } : ({ serving_size: null, calories: null, protein_g: null, fat_g: null, carbs_g: null, sugar_g: null, sodium_mg: null, [key]: value } as NutritionFacts)
    );
  }

  async function lookupNutrition(forProduct: StructuredProduct) {
    setLoadingNutrition(true);
    setNutritionError(null);
    try {
      const res = await fetch("/api/products/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forProduct)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNutrition(await res.json());
      setNutritionFromDatabase(false);
    } catch (e: any) {
      setNutritionError(e.message ?? "Couldn't estimate nutrition facts.");
    } finally {
      setLoadingNutrition(false);
    }
  }

  async function handleSave() {
    if (!product || !storeId || !price) return;
    setSaving(true);
    setError(null);
    try {
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...product,
          imageBase64: lastImageBase64 ?? undefined,
          imageUrl: !lastImageBase64 ? productImageUrl ?? undefined : undefined,
          nutrition_facts: nutrition,
          barcode: scannedBarcode ?? undefined
        })
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
      setProductImageUrl(null);
      setNutrition(null);
      setNutritionFromDatabase(false);
      setNutritionError(null);
      setScannedBarcode(null);
    } catch (e: any) {
      setError(e.message ?? "Couldn't save this item.");
    } finally {
      setSaving(false);
    }
  }

  function resetProduct() {
    setProduct(null);
    setProductImageUrl(null);
    setNutrition(null);
    setNutritionFromDatabase(false);
    setNutritionError(null);
    setError(null);
    setScannedBarcode(null);
  }

  return (
    <AppPage>
      <Link href="/inventory" className="btn-shine mb-4 inline-flex items-center gap-1 rounded border border-value bg-value px-3 py-1.5 font-display text-sm text-white transition-all hover:border-value-soft active:border-value-dark active:bg-value-dark hover:text-white active:text-white duration-200 hover:scale-105">
        ← {t("Back to Manage Inventory")}
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-xl font-semibold text-ink">{t("Add an item")}</h1>
        <p className="mt-1 text-sm text-ash">{t("Snap a photo or enter the details — then set your price.")}</p>
      </header>

      {!product && (
        <div className="flex flex-col gap-3">
          {mode === "menu" && !extracting && !scanningBarcode && (
            // Solid dark green at rest (bg-value), with the border
            // lightening on hover/press — matches the Manage Inventory
            // action buttons above, on both the website and the app (this
            // page isn't split by isNativeApp, so one style covers both).
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                aria-label={t("Scan Barcode")}
                className="btn-shine flex flex-1 items-center justify-center rounded border border-value bg-value px-4 py-3 text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105"
              >
                {/* Same icon as the customer-side Scan button, for a
                    consistent look across both accounts — a custom glyph
                    (18 uneven bars) rather than lucide's sparser Barcode
                    icon, matching the barcode in the app's own
                    logo/watermark. */}
                <svg width="48" height="28" viewBox="0 0 120 78" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <g fill="currentColor">
                    <rect x="2" y="0" width="3" height="78" />
                    <rect x="8" y="0" width="5" height="78" />
                    <rect x="16" y="0" width="2" height="78" />
                    <rect x="21" y="0" width="4" height="78" />
                    <rect x="28" y="0" width="3" height="78" />
                    <rect x="34" y="0" width="6" height="78" />
                    <rect x="43" y="0" width="2" height="78" />
                    <rect x="48" y="0" width="4" height="78" />
                    <rect x="55" y="0" width="3" height="78" />
                    <rect x="61" y="0" width="5" height="78" />
                    <rect x="69" y="0" width="2" height="78" />
                    <rect x="74" y="0" width="4" height="78" />
                    <rect x="81" y="0" width="3" height="78" />
                    <rect x="87" y="0" width="6" height="78" />
                    <rect x="96" y="0" width="2" height="78" />
                    <rect x="101" y="0" width="4" height="78" />
                    <rect x="108" y="0" width="3" height="78" />
                    <rect x="114" y="0" width="4" height="78" />
                  </g>
                </svg>
              </button>
              <button
                type="button"
                onClick={handleSnap}
                aria-label={t("Snap")}
                className="btn-shine flex flex-1 items-center justify-center rounded border border-value bg-value px-4 py-3 text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105"
              >
                <CameraIcon size={36} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setMode("text")}
                className="btn-shine flex-1 rounded border border-value bg-value px-4 py-3 font-display text-[15px] text-white transition-all hover:border-value-soft hover:text-white active:border-value-dark active:bg-value-dark active:text-white duration-200 hover:scale-105"
              >
                {t("Enter item details")}
              </button>
            </div>
          )}
          {scanningBarcode && <p className="text-sm text-ash"><StatusDots label={t("Reading barcode…")} /></p>}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
          {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />}
          {showInPageCamera && (
            <InPageCamera onCapture={handleInPageCapture} onClose={() => setShowInPageCamera(false)} onError={setError} />
          )}

          {mode === "text" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (textQuery.trim()) extract({ text: textQuery.trim() });
              }}
              className="flex flex-col gap-2 rounded border border-line bg-field-raised px-3 py-2"
            >
              <input
                autoFocus
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                placeholder={t("e.g. Al Ain fresh milk 1L")}
                className="w-full bg-transparent text-[15px] text-ink placeholder:text-ash outline-none"
                disabled={extracting}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode("menu")}
                  disabled={extracting}
                  className="text-sm text-ash underline hover:text-ink disabled:opacity-40"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={extracting || !textQuery.trim()}
                  className={`rounded-sm px-4 py-1.5 font-display text-sm font-medium transition-colors disabled:opacity-40 ${
                    textQuery.trim()
                      ? "btn-shine border border-value bg-value text-white active:bg-value-dark hover:border-value-soft hover:text-white active:border-value-dark active:text-white transition-all duration-200 hover:scale-105"
                      : "btn-shine border border-value bg-value text-white hover:border-value-soft hover:text-white active:bg-value-dark active:border-value-dark active:text-white transition-all duration-200 hover:scale-105"
                  }`}
                >
                  {extracting ? <StatusDots label={t("Reading…")} dotClassName="bg-white" /> : t("Identify")}
                </button>
              </div>
            </form>
          )}

          {extracting && mode === "menu" && <p className="text-sm text-ash">{t("Reading…")}</p>}
          {saved && <p className="text-sm text-value">{t("Saved — add another item, or head back to your dashboard.")}</p>}
        </div>
      )}

      {product && (
        <div className="mt-2 flex flex-col gap-3 rounded border border-line bg-field-raised p-4">
          <button
            type="button"
            onClick={resetProduct}
            className="self-start text-sm text-ash underline hover:text-ink"
          >
            ← {t("Back to add item")}
          </button>
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

          <div className="rounded border border-line bg-field p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">{t("Nutrition facts")}</p>
              {loadingNutrition && <span className="font-mono text-xs text-ash">{t("Estimating…")}</span>}
            </div>

            {nutritionError && (
              <p className="mt-1 text-xs text-flag">
                {nutritionError}{" "}
                <button
                  type="button"
                  onClick={() => product && lookupNutrition(product)}
                  className="underline hover:text-flag/80"
                >
                  {t("Retry")}
                </button>
              </p>
            )}

            {nutrition && (
              <>
                <p className="mt-1 text-xs text-ash">
                  {nutritionFromDatabase
                    ? t("From the product database — real label data, not an estimate.")
                    : t("AI estimate based on similar products — please check against the actual package before relying on it.")}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <label className="text-xs text-ash">
                    {t("Serving size")}
                    <input
                      value={nutrition.serving_size ?? ""}
                      onChange={(e) => updateNutritionField("serving_size", e.target.value || null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Calories")}
                    <input
                      type="number"
                      value={nutrition.calories ?? ""}
                      onChange={(e) => updateNutritionField("calories", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Protein (g)")}
                    <input
                      type="number"
                      value={nutrition.protein_g ?? ""}
                      onChange={(e) => updateNutritionField("protein_g", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Fat (g)")}
                    <input
                      type="number"
                      value={nutrition.fat_g ?? ""}
                      onChange={(e) => updateNutritionField("fat_g", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Carbs (g)")}
                    <input
                      type="number"
                      value={nutrition.carbs_g ?? ""}
                      onChange={(e) => updateNutritionField("carbs_g", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Sugar (g)")}
                    <input
                      type="number"
                      value={nutrition.sugar_g ?? ""}
                      onChange={(e) => updateNutritionField("sugar_g", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                  <label className="text-xs text-ash">
                    {t("Sodium (mg)")}
                    <input
                      type="number"
                      value={nutrition.sodium_mg ?? ""}
                      onChange={(e) => updateNutritionField("sodium_mg", e.target.value ? parseFloat(e.target.value) : null)}
                      className="mt-0.5 w-full rounded border border-line bg-field-raised px-2 py-1 text-sm text-ink outline-none"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNutrition(null);
                    setNutritionFromDatabase(false);
                  }}
                  className="mt-2 text-xs text-ash underline hover:text-ink"
                >
                  {t("Remove nutrition facts")}
                </button>
              </>
            )}
          </div>

          {error && <p className="text-sm text-flag">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !price}
              className="btn-shine rounded-sm border border-value bg-value px-4 py-2 font-display text-sm font-medium text-white transition-all hover:border-value-soft hover:text-white active:bg-value-dark active:border-value-dark active:text-white disabled:opacity-40 duration-200 hover:scale-105"
            >
              {saving ? t("Saving…") : t("Save item")}
            </button>
            <button onClick={resetProduct} className="rounded-sm px-4 py-2 font-display text-sm text-ash">
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
    </AppPage>
  );
}

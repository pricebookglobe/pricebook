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
import { SizeValueInput } from "@/components/shared/SizeValueInput";
import {
  CATEGORY_OPTIONS,
  SIZE_TYPES,
  SIZE_TYPE_LABELS,
  SIZE_TYPE_UNITS,
  defaultUnitForSizeType,
  inferCategory,
  inferSizeType,
  isNutritionRelevant,
  type SizeType
} from "@/lib/productCategorization";
import { CATEGORY_TREE } from "@/lib/categories";

// Fills in sensible defaults for whatever a given extraction source
// (GPT vision/text, or the barcode DB lookup) didn't already provide —
// pack_size always has a real answer (1, a single item, unless told
// otherwise), and size_type/unit/size fall back to a name-based guess
// rather than sitting blank, while staying fully editable afterward.
function normalizeProduct(p: StructuredProduct): StructuredProduct {
  const category = p.category || inferCategory(p.product_name)?.subcategory || "";
  const sizeType: SizeType = p.size_type ?? inferSizeType(p.product_name, category || null);
  const units = SIZE_TYPE_UNITS[sizeType];
  return {
    ...p,
    category,
    pack_size: p.pack_size ?? 1,
    size_type: sizeType,
    unit: p.unit && units.includes(p.unit) ? p.unit : defaultUnitForSizeType(sizeType),
    size: p.size ?? (sizeType === "units" ? 1 : null)
  };
}

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
  // Once the admin explicitly picks a Category or Size Type themselves,
  // further edits to the item name stop silently re-guessing that field —
  // the auto-detection is a starting point, not something that fights an
  // explicit override. Reset whenever a fresh product is loaded.
  const [categoryManuallySet, setCategoryManuallySet] = useState(false);
  const [sizeTypeManuallySet, setSizeTypeManuallySet] = useState(false);
  // A plain text mirror of product.pack_size, not the number itself — a
  // controlled <input type="number"> bound straight to product.pack_size
  // snaps back to "1" the instant the field is cleared (parseInt("") is
  // NaN, which the old onChange immediately corrected to 1), so selecting
  // the default "1" and typing a replacement like "24" could silently
  // turn into "124" once the field un-clears itself mid-keystroke. This
  // stays free-form while typing and only resolves to a real number (on
  // product.pack_size) once it parses, defaulting back to "1" on blur if
  // left empty or invalid — so the default is always there to just leave
  // alone, but never fights someone actively replacing it.
  const [packSizeText, setPackSizeText] = useState("1");

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
      setCategoryManuallySet(false);
      setSizeTypeManuallySet(false);
      const normalized = normalizeProduct(extracted);
      setProduct(normalized);
      setPackSizeText(String(normalized.pack_size ?? 1));
      // Runs in the background while the merchant sets a price — not
      // awaited, so it doesn't block the confirm screen from appearing.
      // Barcode-scanned items skip this entirely (they already have real
      // label data from extract() never being called for that path).
      // Skipped outright for anything that isn't food/supplements — a GPT
      // nutrition estimate on a phone case or a bottle of engine oil is
      // just invented numbers with nowhere real to come from.
      if (isNutritionRelevant({ category: normalized.category, productName: normalized.product_name })) {
        lookupNutrition(normalized);
      } else {
        setNutrition(null);
        setNutritionFromDatabase(false);
        setNutritionError(null);
      }
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

      setCategoryManuallySet(false);
      setSizeTypeManuallySet(false);
      const normalized = normalizeProduct(data.structured);
      setProduct(normalized);
      setPackSizeText(String(normalized.pack_size ?? 1));
      setProductImageUrl(data.image_url ?? null);
      setLastImageBase64(null);
      setScannedBarcode(barcode);
      if (
        data.nutrition_facts &&
        isNutritionRelevant({ category: normalized.category, productName: normalized.product_name })
      ) {
        setNutrition(data.nutrition_facts);
        setNutritionFromDatabase(true);
      } else {
        setNutrition(null);
        setNutritionFromDatabase(false);
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
    setCategoryManuallySet(false);
    setSizeTypeManuallySet(false);
    setPackSizeText("1");
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

          {extracting && mode === "menu" && <p className="text-sm text-ash"><StatusDots label={t("Reading…")} /></p>}
          {/* Scan Barcode, Snap, and text search all call setError() on
              failure (barcode not found, a photo the AI couldn't read, a
              network error) while `product` is still null — and this was
              the ONLY place `error` ever got rendered, nested inside the
              product-confirm block below that doesn't exist yet at that
              point. The failure was real but completely invisible: the
              screen just silently reset to this same menu with no
              explanation, which read as "nothing happened" / "didn't
              continue adding the item." */}
          {error && <p className="text-sm text-flag">{error}</p>}
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
              onChange={(e) => {
                const name = e.target.value;
                setProduct((p) => {
                  if (!p) return p;
                  // Re-guesses Category (and, through it, Size Type) as the
                  // name changes — but only up until the admin has picked
                  // one themselves. Once either is manually set, editing
                  // the name here never overwrites that choice again.
                  let category = p.category;
                  if (!categoryManuallySet) category = inferCategory(name)?.subcategory ?? category;
                  let sizeType = p.size_type ?? "units";
                  if (!sizeTypeManuallySet) sizeType = inferSizeType(name, category || null);
                  const units = SIZE_TYPE_UNITS[sizeType];
                  const unit = p.unit && units.includes(p.unit) ? p.unit : defaultUnitForSizeType(sizeType);
                  const size = sizeType === "units" && p.size == null ? 1 : p.size;
                  return { ...p, product_name: name, category, size_type: sizeType, unit, size };
                });
              }}
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
              {/* Auto-detected from the item name above (editable any
                  time) — a plain <select> over the app's existing
                  category taxonomy (lib/categories.ts), the same list
                  "Search by category" already uses on the customer side,
                  so a listing's category always lines up with something a
                  shopper can actually filter by. If the current value
                  (from GPT extraction or a barcode-DB lookup) isn't one of
                  those known subcategories, it's kept as an extra option
                  at the top instead of being silently replaced. */}
              <select
                value={product.category}
                onChange={(e) => {
                  const category = e.target.value;
                  setCategoryManuallySet(true);
                  setProduct((p) => {
                    if (!p) return p;
                    let sizeType = p.size_type ?? "units";
                    if (!sizeTypeManuallySet) sizeType = inferSizeType(p.product_name, category);
                    const units = SIZE_TYPE_UNITS[sizeType];
                    const unit = p.unit && units.includes(p.unit) ? p.unit : defaultUnitForSizeType(sizeType);
                    const size = sizeType === "units" && p.size == null ? 1 : p.size;
                    const updated = { ...p, category, size_type: sizeType, unit, size };
                    // A category edit can flip whether nutrition facts make
                    // sense at all — fetch an estimate the moment it becomes
                    // relevant (e.g. corrected from "Other" to "Snacks &
                    // Sweets"), or drop a stale/invented one the moment it
                    // stops being relevant.
                    if (isNutritionRelevant({ category, productName: updated.product_name })) {
                      if (!nutrition) lookupNutrition(updated);
                    } else {
                      setNutrition(null);
                      setNutritionFromDatabase(false);
                      setNutritionError(null);
                    }
                    return updated;
                  });
                }}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              >
                {!product.category && <option value="">{t("Select a category")}</option>}
                {product.category && !CATEGORY_OPTIONS.some((o) => o.subcategory === product.category) && (
                  <option value={product.category}>{product.category}</option>
                )}
                {CATEGORY_TREE.map((group) => (
                  <optgroup key={group.name} label={group.name}>
                    {group.subcategories.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-sm text-ash">
              {t("Pack Size")}
              <input
                type="number"
                min={1}
                step={1}
                value={packSizeText}
                onChange={(e) => {
                  const text = e.target.value;
                  setPackSizeText(text);
                  // Updates the real value the moment it's a valid pack
                  // size, but doesn't force the visible text back to "1"
                  // just because it's momentarily empty mid-edit — that
                  // snap-back is what let a cleared "1" turn into "124"
                  // instead of "24" when a keystroke landed right after
                  // the field silently reset itself.
                  const n = parseInt(text, 10);
                  if (Number.isFinite(n) && n > 0) updateProductField("pack_size", n);
                }}
                onBlur={() => {
                  const n = parseInt(packSizeText, 10);
                  const resolved = Number.isFinite(n) && n > 0 ? n : 1;
                  setPackSizeText(String(resolved));
                  updateProductField("pack_size", resolved);
                }}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
              {/* Explains what this field means right where it's filled
                  in, rather than relying on the name alone — "Pack Size"
                  reads ambiguous (box dimensions? package weight?)
                  without this. */}
              <span className="mt-1 block text-xs normal-case text-ash/80">
                {t("How many individual units are sold together (e.g. a 6-pack of cans). Size below describes ONE of them.")}
              </span>
            </label>
            <label className="text-sm text-ash">
              {t("Size Type")}
              <select
                value={product.size_type ?? "units"}
                onChange={(e) => {
                  const sizeType = e.target.value as SizeType;
                  setSizeTypeManuallySet(true);
                  setProduct((p) => {
                    if (!p) return p;
                    const size = sizeType === "units" && p.size == null ? 1 : p.size;
                    return { ...p, size_type: sizeType, unit: defaultUnitForSizeType(sizeType), size };
                  });
                }}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              >
                {SIZE_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {t(SIZE_TYPE_LABELS[st])}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ash">
              {t("Size")}
              <SizeValueInput
                value={product.size}
                unit={product.unit || defaultUnitForSizeType(product.size_type ?? "units")}
                options={SIZE_TYPE_UNITS[product.size_type ?? "units"]}
                onValueChange={(v) => updateProductField("size", v)}
                onUnitChange={(u) => updateProductField("unit", u)}
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

          {isNutritionRelevant({ category: product.category, productName: product.product_name }) && (
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
          )}

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

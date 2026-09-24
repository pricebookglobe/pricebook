"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { toCSV } from "@/lib/csv";

type UploadResult = { added: number; updated: number; total: number; failed: { row: number; reason: string }[] };

const TEMPLATE_ROWS = [
  ["item_name", "brand", "size", "unit", "category", "price", "currency", "barcode"],
  ["Al Ain Fresh Milk", "Al Ain", "1", "L", "dairy", "1.10", "JOD", ""],
  ["Snickers", "Mars", "50", "g", "snacks", "0.45", "JOD", ""]
];

export default function BulkUploadPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/inventory/bulk");
        return;
      }
      setToken(data.session.access_token);
      const storeRes = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await storeRes.json();
      if (!store) {
        router.push("/overview");
        return;
      }
      setStoreId(store.id);
      setLoading(false);
    });
  }, [router]);

  function downloadTemplate() {
    const csv = toCSV(TEMPLATE_ROWS);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricebook-inventory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleUpload() {
    if (!csvText || !storeId || !token) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/stores/${storeId}/bulk-inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csv: csvText })
      });

      const raw = await res.text();
      let data: any;
      try {
        data = JSON.parse(raw);
      } catch {
        // The server sent back something that isn't JSON at all (a raw
        // platform error page, most often) — show the response status
        // instead of a cryptic "unexpected token" parse error.
        throw new Error(`Server returned an unexpected response (status ${res.status}). Please try again in a moment.`);
      }

      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Couldn't process that file.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppPage>
      <Link href="/inventory" className="text-sm text-ash underline hover:text-ink">
        ← {t("Back to Manage Inventory")}
      </Link>

      <h1 className="mt-2 font-display text-xl font-semibold text-ink">{t("Bulk Upload")}</h1>
      <p className="mt-1 text-sm text-ash">
        {t(
          "Register many items at once, or update all your prices in one go — upload the same file again anytime and existing items get their price updated instead of duplicated."
        )}
      </p>

      {loading && <p className="mt-6 text-sm text-ash">…</p>}

      {!loading && (
        <>
          <div className="mt-6 rounded border border-line bg-field p-4">
            <p className="text-sm font-medium text-ink">{t("1. Get the template")}</p>
            <p className="mt-1 text-sm text-ash">
              {t("A spreadsheet with the right columns. Open it in Excel, Google Sheets, or Numbers, fill in your items, then save or export as CSV.")}
            </p>
            <button
              onClick={downloadTemplate}
              className="mt-3 rounded-sm border border-line bg-field-raised px-4 py-2 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value hover:text-white"
            >
              {t("Download template (CSV)")}
            </button>
          </div>

          <div className="mt-4 rounded border border-line bg-field p-4">
            <p className="text-sm font-medium text-ink">{t("2. Upload your file")}</p>
            <p className="mt-1 text-sm text-ash">
              {t("Required columns: item_name, category, price. Optional: brand, size, unit, currency (defaults to JOD), barcode.")}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-sm border border-line bg-field-raised px-4 py-2 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value hover:text-white"
              >
                {t("Choose CSV file")}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              {fileName && <span className="text-sm text-ash">{fileName}</span>}
            </div>

            {csvText && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-3 rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
              >
                {uploading ? t("Uploading…") : t("Upload and process")}
              </button>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-flag">{error}</p>}

          {result && (
            <div className="mt-4 rounded border border-line bg-field p-4">
              <p className="text-sm text-ink">
                <strong className="text-value">{result.added}</strong> {t("items added")} ·{" "}
                <strong className="text-value">{result.updated}</strong> {t("prices updated")}
                {result.failed.length > 0 && (
                  <>
                    {" · "}
                    <strong className="text-flag">{result.failed.length}</strong> {t("rows failed")}
                  </>
                )}
              </p>
              {result.failed.length > 0 && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded border border-line bg-field-raised">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th className="px-3 py-1.5 font-mono text-xs uppercase text-ash">{t("Row")}</th>
                        <th className="px-3 py-1.5 font-mono text-xs uppercase text-ash">{t("Reason")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed.map((f) => (
                        <tr key={f.row} className="border-b border-line last:border-0">
                          <td className="px-3 py-1.5 text-ink">{f.row}</td>
                          <td className="px-3 py-1.5 text-flag">{f.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link href="/registered-items" className="mt-3 inline-block text-sm text-value underline hover:text-value/80">
                {t("View Registered Items")}
              </Link>
            </div>
          )}
        </>
      )}
    </AppPage>
  );
}

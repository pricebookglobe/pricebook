"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GeolocationProvider, useGeolocation } from "@/components/shared/GeolocationProvider";
import { ResultRow } from "@/components/search/ResultRow";
import { GuidedTextEntry } from "@/components/check-price/GuidedTextEntry";
import { searchProducts, type SearchResponse } from "@/lib/api";
import { AppPage } from "@/components/shared/AppPage";
import { PageShell } from "@/components/shared/PageShell";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { useAccount } from "@/lib/AccountProvider";

const TIER_LABEL: Record<string, string> = {
  neighborhood: "neighborhood zone",
  town: "town zone",
  city: "city zone"
};

const AT_STORE_METERS = 150;

type Mode = "idle" | "choosing" | "text";

// Logged-out visitors land here — a sign-in screen, not the search tool.
// Nothing about checking or tracking prices is shown until authenticated.
function SignedOutHome() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">{t("Log in")}</h1>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          required
          type="email"
          value={email}
          placeholder={t("Email")}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink placeholder:text-ash outline-none focus:border-ink/40"
        />
        <input
          required
          type="password"
          value={password}
          placeholder={t("Password")}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-line bg-field px-3 py-2.5 text-[15px] text-ink placeholder:text-ash outline-none focus:border-ink/40"
        />
        {error && <p className="text-center text-sm text-flag">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white hover:bg-value/90 disabled:opacity-40"
        >
          {busy ? t("Logging in…") : t("Log in")}
        </button>
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <Link href="/forgot-password" className="text-ash underline hover:text-ink">
          {t("Forgot password?")}
        </Link>
        <Link href="/signup" className="text-ink underline hover:text-value">
          {t("Sign up")}
        </Link>
      </div>
    </PageShell>
  );
}

function CustomerHome() {
  const { t } = useLanguage();
  const { coords, status } = useGeolocation();
  const [mode, setMode] = useState<Mode>("idle");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [showWiderResults, setShowWiderResults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function runSearch(input: { text?: string; imageBase64?: string; structured?: any }) {
    if (!coords) {
      setError(t("Turn on location so we can find prices near you."));
      return;
    }
    setBusy(true);
    setError(null);
    setShowWiderResults(false);
    try {
      const supabase = createBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      const res = await searchProducts({
        ...input,
        lat: coords.lat,
        lng: coords.lng,
        accessToken: data.session?.access_token
      });
      setResult(res);
      setMode("idle");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
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
    runSearch({ imageBase64 });
    e.target.value = "";
  }

  const sorted = result?.local_results.length
    ? [...result.local_results].sort((a, b) => a.price - b.price)
    : [];
  const cheapestId = sorted[0]?.store_id ?? null;
  const atStore = sorted.find((r) => r.distance_m <= AT_STORE_METERS) ?? null;
  const tableRows = atStore && !showWiderResults ? [] : sorted;

  return (
    <AppPage>
      <p className="mb-6 text-sm text-ash">{t("Track best prices, near you first.")}</p>

      {mode === "idle" && !busy && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode("choosing")}
            className="flex-1 rounded bg-value px-4 py-3 font-display text-[15px] font-medium text-white hover:bg-value/90"
          >
            {t("Check price")}
          </button>
          <button
            onClick={() => setMode("text")}
            className="flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-[15px] text-ink transition-colors hover:border-value hover:bg-value hover:text-white"
          >
            {t("Search items")}
          </button>
        </div>
      )}

      {mode === "choosing" && (
        <div className="flex gap-2">
          <button onClick={() => cameraInputRef.current?.click()} className="flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value hover:text-white">
            {t("Snap")}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 rounded border border-line bg-field-raised px-4 py-3 font-display text-sm text-ink transition-colors hover:border-value hover:bg-value hover:text-white">
            {t("Upload")}
          </button>
        </div>
      )}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {mode === "text" && (
        <GuidedTextEntry onSubmit={(structured) => runSearch({ structured })} onCancel={() => setMode("idle")} />
      )}

      {busy && <p className="mt-3 text-sm text-ash">{t("Searching…")}</p>}
      {status === "denied" && (
        <p className="mt-3 text-sm text-flag">
          {t("Location is off, so we can't sort by distance. Enable it in your browser to see nearby prices.")}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-flag">{error}</p>}

      {result && (
        <section className="mt-8">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-medium text-ink">
              {result.query.brand ? `${result.query.brand} ` : ""}
              {result.query.product_name}
            </h2>
            {result.tier && (
              <span className="font-mono text-xs uppercase tracking-wide text-ash">
                {t(TIER_LABEL[result.tier] ?? result.tier)}
              </span>
            )}
          </div>

          {sorted.length === 0 && (
            <p className="text-sm text-ash">
              {t("No store nearby carries this yet.")}
              {result.web_estimate?.source_url && (
                <>
                  {" "}
                  {t("Reference:")}{" "}
                  <a className="underline" href={result.web_estimate.source_url} target="_blank" rel="noreferrer">
                    {t("see online")}
                  </a>
                  .
                </>
              )}
            </p>
          )}

          {atStore && (
            <div className="mb-4 rounded border border-value bg-value-soft px-4 py-3">
              <p className="text-sm text-ink">
                You are at <strong>{atStore.store_name}</strong> — the price here is{" "}
                <strong>{atStore.price.toFixed(2)} {atStore.currency}</strong>.
              </p>
              {!showWiderResults && sorted.length > 1 && (
                <button onClick={() => setShowWiderResults(true)} className="mt-2 text-sm text-value underline hover:text-value/80">
                  See best prices nearby too
                </button>
              )}
            </div>
          )}

          {tableRows.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Store")}</th>
                  <th className="num">{t("Distance")}</th>
                  <th className="num">{t("Price")}</th>
                  <th>{t("Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => (
                  <ResultRow key={r.store_id + r.product_id} result={r} isCheapest={r.store_id === cheapestId} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </AppPage>
  );
}

export default function Page() {
  const router = useRouter();
  const { profile, loading } = useAccount();

  useEffect(() => {
    // Admins and merchants land on their own dashboards instead of the
    // generic customer search page — visiting "/" is effectively "take me
    // home", and each role's home is somewhere else.
    if (!loading && profile?.role === "admin") router.replace("/admin");
    else if (!loading && profile?.role === "merchant") router.replace("/dashboard");
  }, [loading, profile, router]);

  if (loading) return null;
  if (!profile) return <SignedOutHome />;
  if (profile.role === "admin" || profile.role === "merchant") return null; // redirecting

  return (
    <GeolocationProvider>
      <CustomerHome />
    </GeolocationProvider>
  );
}

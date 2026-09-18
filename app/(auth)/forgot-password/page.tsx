"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/login` : undefined
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <main className="velvet-field flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <img src="/pricebook-logo.png" alt="PriceBook" className="h-auto w-28" />
          <h1 className="mt-4 font-display text-xl font-semibold text-white">Reset your password</h1>
        </div>

        {sent ? (
          <p className="mt-6 text-center text-sm text-white/80">
            If an account exists for that email, a reset link is on its way. Check your inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <input
              required
              type="email"
              value={email}
              placeholder="Email"
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white placeholder:text-white/50 outline-none focus:border-white/40"
            />

            {error && <p className="text-center text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="mt-5 text-center text-sm">
          <a href="/login" className="text-white/60 underline hover:text-white">
            Back to log in
          </a>
        </div>
      </div>
    </main>
  );
}

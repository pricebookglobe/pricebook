"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { PageShell } from "@/components/shared/PageShell";

export default function CustomerSignup() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createBrowserSupabase();
    // The 0004 migration's trigger reads options.data to fill in
    // public.users automatically — role defaults to 'customer' there.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role: "customer" } }
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.push("/");
  }

  return (
    <PageShell maxWidth="max-w-sm">
      <h1 className="text-center font-display text-xl font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-center text-sm text-ash">Find the best local prices, saved to your name.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <label className="text-sm text-ash">
          Full name
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>
        <label className="text-sm text-ash">
          Password
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
          />
        </label>

        {error && <p className="text-sm text-flag">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-field disabled:opacity-40"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-sm text-ash">
        Own a store instead?{" "}
        <a href="/signup/merchant" className="underline text-ink">
          Sign up as a merchant
        </a>
      </p>
    </PageShell>
  );
}

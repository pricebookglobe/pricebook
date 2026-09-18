"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
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

    router.push(params.get("next") ?? "/");
  }

  return (
    <main className="velvet-field flex min-h-screen items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/pricebook-logo.png"
            alt="PriceBook"
            width={120}
            height={65}
            priority
            className="h-auto w-28"
          />
          <h1 className="mt-4 font-display text-xl font-semibold text-white">Log in</h1>
        </div>

        {params.get("justSignedUp") && (
          <p className="mt-4 rounded-sm bg-value-soft/90 px-3 py-2 text-center text-sm text-value">
            Check your email to confirm your account, then log in here.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            required
            type="email"
            value={email}
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white placeholder:text-white/50 outline-none focus:border-white/40"
          />
          <input
            required
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-white/15 bg-white/10 px-3 py-2.5 text-[15px] text-white placeholder:text-white/50 outline-none focus:border-white/40"
          />

          {error && <p className="text-center text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-sm bg-value px-4 py-2.5 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <a href="/forgot-password" className="text-white/60 underline hover:text-white">
            Forgot password?
          </a>
          <a href="/signup/customer" className="text-white/80 underline hover:text-white">
            Sign up
          </a>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

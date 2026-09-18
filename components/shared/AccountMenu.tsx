"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";

type Profile = { full_name: string | null; email: string; role: "customer" | "merchant" | "admin" };

export function AccountMenu() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setLoading(false);
        return;
      }
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) setProfile(await res.json());
      setLoading(false);
    });
  }, []);

  async function handleLogout() {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading) return <div className="h-5 w-24" />; // avoid layout shift while checking session

  if (!profile) {
    return (
      <div className="flex gap-3 font-mono text-xs text-ash">
        <a href="/login" className="underline hover:text-ink">Log in</a>
        <a href="/signup" className="underline hover:text-ink">Sign up</a>
        <a href="/signup/merchant" className="underline hover:text-ink">Sell on PriceBook</a>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-sm border border-line bg-field-raised px-3 py-1.5 text-sm text-ink hover:border-ink/30"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-value text-[11px] font-medium text-white">
          {(profile.full_name || profile.email)[0]?.toUpperCase()}
        </span>
        {profile.full_name || profile.email}
      </button>

      {open && (
        <>
          {/* Backdrop closes the drawer on click-away */}
          <div className="fixed inset-0 z-40 bg-ink/20" onClick={() => setOpen(false)} />
          <div className="fixed right-0 top-0 z-50 flex h-full w-72 flex-col border-l border-line bg-field-raised p-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="font-display text-sm font-semibold text-ink">{profile.full_name || "Account"}</p>
                <p className="text-xs text-ash">{profile.email}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-ash hover:text-ink" aria-label="Close">
                ✕
              </button>
            </div>

            <nav className="flex flex-col gap-1 text-sm">
              {profile.role === "merchant" ? (
                <a href="/dashboard" className="rounded-sm px-3 py-2 text-ink hover:bg-field">Dashboard</a>
              ) : (
                <a href="/history" className="rounded-sm px-3 py-2 text-ink hover:bg-field">Search history</a>
              )}
              <a href="/settings" className="rounded-sm px-3 py-2 text-ink hover:bg-field">Settings</a>
            </nav>

            <div className="mt-auto">
              <button
                onClick={handleLogout}
                className="w-full rounded-sm bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
              >
                Log out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

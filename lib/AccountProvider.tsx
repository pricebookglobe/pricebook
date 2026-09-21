"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserSupabase } from "./supabaseClient";

export type Profile = {
  full_name: string | null;
  email: string;
  role: "customer" | "merchant" | "admin";
  delete_history_on_logout: boolean;
};

type AccountState = {
  profile: Profile | null;
  storeName: string | null;
  storeId: string | null;
  storeLogoUrl: string | null;
  token: string | null;
  loading: boolean;
  refresh: () => void;
};

const AccountContext = createContext<AccountState>({
  profile: null,
  storeName: null,
  storeId: null,
  storeLogoUrl: null,
  token: null,
  loading: true,
  refresh: () => {}
});

export function useAccount() {
  return useContext(AccountContext);
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeLogoUrl, setStoreLogoUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabase();
    // Tracks whose profile this specific tab is currently showing, so the
    // guard below can tell "this tab's own session changed" apart from
    // "a session appeared because a totally different tab did something."
    let shownUserId: string | null = null;

    async function load() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !userData.user) {
        shownUserId = null;
        setProfile(null);
        setStoreName(null);
        setStoreId(null);
        setStoreLogoUrl(null);
        setToken(null);
        setLoading(false);
        return;
      }
      shownUserId = userData.user.id;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }
      setToken(accessToken);

      const res = await fetch("/api/me", { headers: { Authorization: `Bearer ${accessToken}` } });
      if (cancelled) return;
      if (res.ok) {
        const p: Profile = await res.json();
        setProfile(p);
        if (p.role === "merchant") {
          // A single failed request here (a cold start, a transient
          // network blip) would otherwise leave storeId null for the rest
          // of the session, with nothing to ever retry it — one retry
          // after a short pause covers the common transient case.
          async function fetchStore() {
            const storeRes = await fetch("/api/merchant/store", { headers: { Authorization: `Bearer ${accessToken}` } });
            return storeRes.json().catch(() => null);
          }
          let store = await fetchStore();
          if (!store) {
            await new Promise((resolve) => setTimeout(resolve, 800));
            store = await fetchStore();
          }
          if (!cancelled && store) {
            setStoreName(store.name);
            setStoreId(store.id);
            setStoreLogoUrl(store.logo_url ?? null);
          }
        }
      }
      setLoading(false);
    }

    load();

    // Re-run on real auth changes (login/logout), not on route navigation —
    // this context lives at the root layout, so it survives client-side
    // page transitions and never has to refetch just because the person
    // clicked a sidebar link.
    //
    // The browser's Supabase client persists its session to localStorage,
    // which Supabase syncs across every open tab on the site — so without
    // the guard below, someone signing up (or logging in as) a different
    // account in ANY tab would silently replace the profile shown in THIS
    // tab too, even if nobody touched this tab at all. That's how an admin
    // dashboard left open in one tab could end up showing a brand-new
    // store's name and logo just because someone signed that store up in
    // another tab. A logout anywhere should still log this tab out (that's
    // expected), and a tab with nobody signed in should still pick up
    // whatever session shows up. What it must never do is drop the profile
    // it's already showing in favor of a DIFFERENT person's, unless this
    // tab is the one that actually signed out first.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        shownUserId = null;
        load();
        return;
      }
      const incomingUserId = session?.user?.id ?? null;
      if (shownUserId && incomingUserId && incomingUserId !== shownUserId) {
        return; // a different tab's session change — not ours to adopt
      }
      load();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [nonce]);

  return (
    <AccountContext.Provider
      value={{ profile, storeName, storeId, storeLogoUrl, token, loading, refresh: () => setNonce((n) => n + 1) }}
    >
      {children}
    </AccountContext.Provider>
  );
}

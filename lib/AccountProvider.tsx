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

    async function load() {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (cancelled) return;
      if (userError || !userData.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

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
          const storeRes = await fetch("/api/merchant/store", { headers: { Authorization: `Bearer ${accessToken}` } });
          const store = await storeRes.json().catch(() => null);
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
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
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

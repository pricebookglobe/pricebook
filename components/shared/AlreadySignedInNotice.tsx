"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabaseClient";

// Guards every signup form. The browser's Supabase client is a single
// shared instance whose session lives in localStorage and is synced across
// every open tab on the site (see lib/supabaseClient.ts). Without this
// guard, submitting a signup form while already logged in (e.g. an admin
// creating a test account in the same browser) silently swaps the active
// session to the new account everywhere the site is open — including
// other tabs — replacing the original account's name/avatar in the
// sidebar with the new signup's. Requiring an explicit log-out first turns
// that silent identity swap into a deliberate, visible action.
export function AlreadySignedInNotice({ email, displayName }: { email: string; displayName: string }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    window.location.reload();
  }

  return (
    <div className="rounded border border-line bg-field px-4 py-4 text-sm text-ink">
      <p>
        You're currently signed in as <span className="font-medium">{displayName}</span> ({email}).
      </p>
      <p className="mt-1 text-ash">
        Creating a new account here will sign you out of that session in this tab. Log out first to continue.
      </p>
      <button
        type="button"
        onClick={handleLogout}
        disabled={signingOut}
        className="mt-3 rounded-sm bg-ink px-4 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-value disabled:opacity-40"
      >
        {signingOut ? "Logging out…" : "Log out and continue"}
      </button>
    </div>
  );
}

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser client: safe to import into client components. Uses the anon key,
// so it is bound by the row-level security policies in supabase/migrations.
//
// Cached as a module-level singleton — creating a new client per component
// (the original version of this function) triggers Supabase's own
// "Multiple GoTrueClient instances detected" warning and can cause
// different components to briefly disagree about auth state, since each
// instance manages its own in-memory copy of the session.
let _browserClient: SupabaseClient | null = null;
export function createBrowserSupabase(): SupabaseClient {
  if (!_browserClient) {
    _browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _browserClient;
}

// Server client: for API routes only. Uses the service-role key, which
// bypasses RLS — never import this file into a client component.
export function createServiceSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

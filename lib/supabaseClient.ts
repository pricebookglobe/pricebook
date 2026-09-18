import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser client: safe to import into client components. Uses the anon key,
// so it is bound by the row-level security policies in supabase/migrations.
export function createBrowserSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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

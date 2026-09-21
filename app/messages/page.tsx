"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Message = { id: string; subject: string; message: string; is_read: boolean; created_at: string };

export default function MessagesPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [rows, setRows] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/messages");
        return;
      }
      const storeRes = await fetch("/api/merchant/store", {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      const store = await storeRes.json();
      if (!store) {
        router.push("/overview");
        return;
      }
      const res = await fetch(`/api/stores/${store.id}/messages`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (res.ok) setRows(await res.json());
      setLoading(false);
    });
  }, [router]);

  return (
    <AppPage>
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">{t("Messages")}</h1>
      {loading && <p className="text-sm text-ash">…</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-ash">{t("No messages yet.")}</p>}
      {rows.map((m) => (
        <div key={m.id} className="border-b border-line py-3">
          <p className="font-display text-[15px] font-medium text-ink">{m.subject}</p>
          <p className="mt-1 text-sm text-ink">{m.message}</p>
          <p className="mt-1 font-mono text-[11px] text-ash">{new Date(m.created_at).toLocaleString()}</p>
        </div>
      ))}
    </AppPage>
  );
}

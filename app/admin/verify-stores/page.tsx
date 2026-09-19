"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabaseClient";
import { AppPage } from "@/components/shared/AppPage";

type StoreRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  commercial_registration: string;
  contact_person_name: string | null;
  admin_email: string | null;
  cr_certificate_url: string | null;
  store_photo_url: string | null;
  verification_status: "pending" | "approved" | "rejected";
};

export default function VerifyStoresPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/login?next=/admin/verify-stores");
        return;
      }
      setToken(data.session.access_token);
      const res = await fetch("/api/admin/stores", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (res.status === 403) {
        setForbidden(true);
      } else if (res.ok) {
        setRows(await res.json());
      }
      setLoading(false);
    });
  }, [router]);

  async function decide(id: string, status: "approved" | "rejected") {
    if (!token) return;
    setRows((r) => r.map((s) => (s.id === id ? { ...s, verification_status: status } : s)));
    await fetch(`/api/admin/stores/${id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
  }

  if (loading) return <AppPage><p className="text-sm text-ash">…</p></AppPage>;
  if (forbidden) return <AppPage><p className="text-sm text-flag">Admins only.</p></AppPage>;

  const pending = rows.filter((r) => r.verification_status === "pending");
  const decided = rows.filter((r) => r.verification_status !== "pending");

  return (
    <AppPage maxWidth="max-w-4xl">
      <h1 className="mb-6 font-display text-xl font-semibold text-ink">Store verification</h1>

      <h2 className="mb-2 font-display text-[15px] font-medium text-ink">Pending ({pending.length})</h2>
      {pending.length === 0 && <p className="text-sm text-ash">Nothing waiting on review.</p>}
      {pending.map((s) => (
        <div key={s.id} className="mb-3 rounded border border-line bg-field p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-[15px] font-medium text-ink">{s.name}</p>
              <p className="text-sm text-ash">{s.address}, {s.city}</p>
              <p className="mt-1 font-mono text-xs text-ash">CR #{s.commercial_registration}</p>
              <p className="font-mono text-xs text-ash">Contact: {s.contact_person_name} · {s.admin_email}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => decide(s.id, "approved")} className="rounded-sm bg-value px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              <button onClick={() => decide(s.id, "rejected")} className="rounded-sm bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600">Reject</button>
            </div>
          </div>
          <div className="mt-3 flex gap-3">
            {s.cr_certificate_url && (
              <a href={s.cr_certificate_url} target="_blank" rel="noreferrer" className="text-xs text-ink underline">
                View CR certificate
              </a>
            )}
            {s.store_photo_url && (
              <a href={s.store_photo_url} target="_blank" rel="noreferrer" className="text-xs text-ink underline">
                View store photo
              </a>
            )}
          </div>
        </div>
      ))}

      <h2 className="mb-2 mt-8 font-display text-[15px] font-medium text-ink">Already decided</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Store</th>
            <th>City</th>
            <th className="num">Status</th>
          </tr>
        </thead>
        <tbody>
          {decided.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.city}</td>
              <td className={"num " + (s.verification_status === "approved" ? "text-value" : "text-flag")}>
                {s.verification_status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppPage>
  );
}

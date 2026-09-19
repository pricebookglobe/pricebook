"use client";

export type StoreDetails = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string;
  commercial_registration: string;
  contact_person_name: string | null;
  admin_email: string | null;
  cr_certificate_url: string | null;
  store_photo_url: string | null;
  logo_url: string | null;
  verification_status: "pending" | "approved" | "rejected";
  is_frozen: boolean;
  rating: number | null;
  rating_count: number | null;
  view_count: number | null;
  created_at: string;
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ash">{label}</p>
      <p className="text-sm text-ink">{value ?? "—"}</p>
    </div>
  );
}

function DocThumb({ label, url }: { label: string; url: string | null }) {
  const isPdf = !!url && url.toLowerCase().split("?")[0].endsWith(".pdf");

  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-ash">{label}</p>
      {!url ? (
        <div className="flex h-28 w-full items-center justify-center rounded border border-dashed border-line text-xs text-ash">
          Not uploaded
        </div>
      ) : isPdf ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded border border-line bg-field text-xs text-ink hover:bg-field-raised"
        >
          <span className="font-display text-sm">PDF</span>
          <span className="underline">Open document</span>
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt={label}
            className="h-28 w-full rounded border border-line object-cover hover:opacity-90"
          />
        </a>
      )}
    </div>
  );
}

export function StoreDetailsDialog({ store, onClose }: { store: StoreDetails | null; onClose: () => void }) {
  if (!store) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 text-left shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{store.name}</h2>
            <p className="text-sm text-ash">{store.address ? `${store.address}, ` : ""}{store.city}</p>
          </div>
          <button onClick={onClose} className="text-sm text-ash hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {store.description && <p className="mb-4 text-sm text-ink">{store.description}</p>}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Field label="Verification status" value={<span className="capitalize">{store.verification_status}</span>} />
          <Field
            label="Account status"
            value={<span className={store.is_frozen ? "text-flag" : "text-value"}>{store.is_frozen ? "Frozen" : "Active"}</span>}
          />
          <Field label="CR #" value={store.commercial_registration} />
          <Field label="Contact person" value={store.contact_person_name} />
          <Field label="Admin email" value={store.admin_email} />
          <Field
            label="Rating"
            value={store.rating != null ? `${store.rating.toFixed(1)} (${store.rating_count ?? 0})` : "—"}
          />
          <Field label="Store page views" value={store.view_count ?? 0} />
          <Field label="Registered" value={new Date(store.created_at).toLocaleDateString()} />
        </div>

        <div className="mb-2 grid grid-cols-3 gap-3">
          <DocThumb label="Logo" url={store.logo_url} />
          <DocThumb label="Store front" url={store.store_photo_url} />
          <DocThumb label="CR certificate" url={store.cr_certificate_url} />
        </div>
        <p className="mb-4 text-xs text-ash">Click a thumbnail to open the full-size file in a new tab.</p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-sm bg-blue-600 px-4 py-2 font-display text-sm font-medium text-white hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

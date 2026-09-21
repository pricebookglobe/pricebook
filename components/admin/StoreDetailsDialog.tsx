"use client";

import { X } from "lucide-react";

type StoreDetails = {
  name: string;
  address: string;
  city: string;
  commercial_registration: string;
  contact_person_name: string | null;
  admin_email: string | null;
  logo_url: string | null;
  cr_certificate_url: string | null;
  store_photo_url: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function StoreDetailsDialog({ store, onClose }: { store: StoreDetails | null; onClose: () => void }) {
  if (!store) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 text-left shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-ash hover:bg-field hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <h2 className="pr-8 font-display text-lg font-semibold text-ink">{store.name}</h2>

        <div className="mt-3 space-y-1 text-sm">
          <p><span className="text-ash">Address:</span> {store.address}, {store.city}</p>
          <p><span className="text-ash">Commercial registration #:</span> {store.commercial_registration}</p>
          <p><span className="text-ash">Contact person:</span> {store.contact_person_name ?? "—"}</p>
          <p><span className="text-ash">Admin email:</span> {store.admin_email ?? "—"}</p>
        </div>

        {store.lat != null && store.lng != null && (
          <div className="mt-4 overflow-hidden rounded border border-line">
            <iframe
              title="Store location"
              width="100%"
              height="180"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps?q=${store.lat},${store.lng}&z=16&t=k&output=embed`}
            />
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
              target="_blank"
              rel="noreferrer"
              className="block bg-field-raised px-3 py-2 text-sm text-value underline hover:text-value/80"
            >
              Open in Maps
            </a>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ash">Uploaded documents</p>
          <div className="flex flex-wrap gap-2">
            {store.logo_url && (
              <a
                href={store.logo_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                View logo
              </a>
            )}
            {store.cr_certificate_url && (
              <a
                href={store.cr_certificate_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                View CR certificate
              </a>
            )}
            {store.store_photo_url && (
              <a
                href={store.store_photo_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                View store photo
              </a>
            )}
            {!store.logo_url && !store.cr_certificate_url && !store.store_photo_url && (
              <p className="text-sm text-ash">No documents uploaded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

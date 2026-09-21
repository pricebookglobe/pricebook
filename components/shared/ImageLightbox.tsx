"use client";

import { X } from "lucide-react";

export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div className="relative max-h-[85vh] max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-3 -top-3 rounded-full bg-white p-1.5 text-ash shadow hover:bg-field hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>
        <img src={src} alt="" className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" />
      </div>
    </div>
  );
}

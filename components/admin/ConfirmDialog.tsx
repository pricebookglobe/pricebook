"use client";

import { X } from "lucide-react";

const TONE_STYLES = {
  danger: "bg-red-600 text-white hover:bg-red-700",
  warning: "bg-value text-white hover:bg-ink-dark",
  positive: "bg-value-soft text-value hover:bg-value hover:text-white active:bg-value-dark active:text-white"
} as const;

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  tone = "danger",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: keyof typeof TONE_STYLES;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-sm rounded-lg bg-white p-6 text-left shadow-2xl">
        <button
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-ash hover:bg-field hover:text-ink"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <h2 className="pr-8 font-display text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-ash">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-sm bg-value-soft px-4 py-2 font-display text-sm font-medium text-value transition-colors hover:bg-value active:bg-value-dark hover:text-white active:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-sm px-4 py-2 font-display text-sm font-medium ${TONE_STYLES[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

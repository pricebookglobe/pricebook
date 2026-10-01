"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

// A single free-text search box — type any item name, in any language, and
// it goes straight to the AI text-parsing step (parseTextQuery) that already
// powers barcode/photo search under the hood. This is the low-friction path;
// GuidedTextEntry's category picker stays available as a fallback for anyone
// who'd rather build the search step by step.
export function FreeTextSearch({
  onSubmit,
  busy
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-field-raised p-4 sm:flex-row">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={t("Type any item, in any language…")}
        className="flex-1 rounded border border-line bg-field px-3 py-2 text-ink outline-none"
        dir="auto"
      />
      <button
        disabled={busy || !value.trim()}
        onClick={submit}
        className="btn-shine rounded-sm bg-value px-5 py-2 font-display text-sm font-bold tracking-wide text-white transition-colors hover:bg-value/90 active:bg-value/90 disabled:opacity-40"
      >
        {t("Search Items")}
      </button>
    </div>
  );
}

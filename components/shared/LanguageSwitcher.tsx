"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

const PRESETS = ["English", "Arabic", "French", "Spanish", "Turkish"];

export function LanguageSwitcher() {
  const { language, setLanguage, loading } = useLanguage();
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px] text-ash">
      {loading && <span className="text-ash/70">translating…</span>}
      <select
        value={PRESETS.includes(language) ? language : "__other__"}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setCustomOpen(true);
          } else {
            setCustomOpen(false);
            setLanguage(e.target.value);
          }
        }}
        className="rounded-full border border-ink/20 bg-transparent px-3 py-1.5 text-ink/80 outline-none"
      >
        {PRESETS.map((p) => (
          <option key={p} value={p} className="text-ink">
            {p}
          </option>
        ))}
        <option value="__other__" className="text-ink">
          {PRESETS.includes(language) ? "Other…" : language}
        </option>
      </select>

      {customOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customValue.trim()) {
              setLanguage(customValue.trim());
              setCustomOpen(false);
            }
          }}
          className="flex gap-1"
        >
          <input
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Any language"
            className="w-24 rounded-sm border border-ink/20 bg-transparent px-1.5 py-1 text-ink/80 outline-none placeholder:text-ink/40"
          />
          <button type="submit" className="text-ink/80 underline">
            Go
          </button>
        </form>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { suggestProducts, type ProductSuggestion } from "@/lib/api";
import { displayProductName, formatSizeTag } from "@/lib/productName";

// A single free-text search box — type any item name, in any language, and
// it goes straight to the AI text-parsing step (parseTextQuery) that already
// powers barcode/photo search under the hood. This is the low-friction path;
// GuidedTextEntry's category picker stays available as a fallback for anyone
// who'd rather build the search step by step.
//
// Also drives a "did you mean...?" typeahead dropdown once there's enough
// typed to match more than one registered product (e.g. "choc" matching
// several different chocolate bars) — each suggestion shows the product's
// own photo so picking the right one doesn't depend on guessing from name
// alone. Shared by both Check Price's "Enter details" and the Search Items
// tab, since both render this same component.
export function FreeTextSearch({
  onSubmit,
  busy
}: {
  onSubmit: (text: string) => void;
  busy: boolean;
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards against a slower, earlier request's response landing AFTER a
  // faster, later one and clobbering it with stale suggestions — bumped on
  // every keystroke, only the request started on the latest bump is
  // allowed to actually update state when it resolves.
  const requestIdRef = useRef(0);

  // Debounced typeahead: waits 300ms of no typing before asking the server,
  // so fast typing doesn't fire a request per keystroke. Only looks once
  // there are at least 2 characters — matches the server-side floor
  // (migration 0032), so a 1-character query never even round-trips.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      const results = await suggestProducts(query);
      if (requestIdRef.current !== requestId) return; // superseded by a newer keystroke
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  // Closes the dropdown on an outside tap/click, without clearing whatever
  // text is already typed.
  useEffect(() => {
    if (!showSuggestions) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showSuggestions]);

  function submit(text?: string) {
    const trimmed = (text ?? value).trim();
    if (!trimmed) return;
    setShowSuggestions(false);
    onSubmit(trimmed);
  }

  function selectSuggestion(s: ProductSuggestion) {
    const name = displayProductName(s.brand, s.product_name);
    setValue(name);
    setSuggestions([]);
    setShowSuggestions(false);
    // Picking a specific suggestion IS the disambiguation step — the
    // shopper already told us exactly which item they meant, so there's no
    // reason to make them press Search again for text that's now an exact
    // match rather than a vague fragment.
    submit(name);
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2 rounded border border-line bg-field-raised p-4 sm:flex-row">
      <div className="relative flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setShowSuggestions(false);
          }}
          placeholder={t("Type any item, in any language…")}
          className="w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          dir="auto"
          autoComplete="off"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
        />

        {showSuggestions && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-field-raised shadow-xl">
            {suggestions.map((s) => {
              const sizeTag = formatSizeTag(s.size, s.unit);
              return (
                <li key={s.product_id}>
                  <button
                    type="button"
                    // onMouseDown (not onClick) fires before the input's own
                    // onBlur, so the click isn't lost to the field closing
                    // the dropdown first.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-field active:bg-value/10"
                  >
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="h-10 w-10 shrink-0 rounded border border-line object-cover" />
                    ) : (
                      <span className="h-10 w-10 shrink-0 rounded border border-dashed border-line bg-field" />
                    )}
                    <span className="min-w-0 truncate text-sm text-ink">
                      {displayProductName(s.brand, s.product_name)}
                      {sizeTag && <span className="ml-1 font-mono text-xs text-ash">{sizeTag}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        disabled={busy || !value.trim()}
        onClick={() => submit()}
        className="btn-shine rounded-sm border border-value bg-value px-5 py-2 font-display text-sm font-bold tracking-wide text-white transition-all active:bg-value-dark disabled:opacity-40 hover:border-value-soft hover:text-white active:border-value-dark active:text-white duration-200 hover:scale-105"
      >
        {t("Search Items")}
      </button>
    </div>
  );
}

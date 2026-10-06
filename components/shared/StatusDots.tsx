// A small "working on it" status line — a label plus three dots that
// bounce in sequence (not just a static ellipsis) — used anywhere the app
// is searching, reading a photo/barcode, or otherwise thinking for more
// than an instant. Centralized here so every one of those moments looks
// and feels the same across the app, instead of each screen inventing its
// own "Searching…"/"Reading…" text with no visual motion to back it up.
export function StatusDots({
  label,
  className = "",
  // "bg-value" (brand green) reads fine on the usual ash-on-field text
  // context. Pass "bg-white" (or similar) when this sits inside a solid
  // colored button, where green-on-green dots would be invisible.
  dotClassName = "bg-value"
}: {
  label: string;
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span>{label}</span>
      <span className="flex items-end gap-1" aria-hidden="true">
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClassName}`} style={{ animationDelay: "0ms" }} />
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClassName}`} style={{ animationDelay: "150ms" }} />
        <span className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClassName}`} style={{ animationDelay: "300ms" }} />
      </span>
    </span>
  );
}

// The boxed version CheckPriceExperience originally used in place of the
// search box/result while a search is in flight — same dots, wrapped in
// the bordered card so it visually replaces whatever it's standing in for.
export function StatusDotsCard({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded border border-line bg-field-raised px-4 py-3 text-sm text-ash ${className}`}>
      <StatusDots label={label} />
    </div>
  );
}

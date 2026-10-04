// A faint, slow-drifting decoration for the big white content card
// (AppPage) — reuses ONLY the barcode + downward-arrow glyph from the
// PriceBook shield logo (app/icon.png), in the exact same teal used there
// (tailwind's `mark` token — see tailwind.config.ts's comment on that
// color), not the shield/PB lettering. Purely decorative: pointer-events
// none, sits behind the page's real content, and is clipped to its parent
// by that parent having `relative overflow-hidden` (see AppPage.tsx).
//
// The downward drift (translateY, looping) leans into the arrow's own
// "down" motif rather than fighting it — see the `watermark-drift`
// keyframes in app/globals.css.
export function BarcodeArrowWatermark() {
  return (
    <div
      aria-hidden="true"
      className="watermark-drift pointer-events-none absolute left-1/2 top-0 w-24 -translate-x-1/2 text-mark opacity-[0.07]"
    >
      <svg viewBox="0 0 120 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* The barcode — uneven bar widths, same irregular look as the
            logo's own mark, not a perfectly even stripe pattern. */}
        <g fill="currentColor">
          <rect x="2" y="0" width="3" height="78" />
          <rect x="8" y="0" width="5" height="78" />
          <rect x="16" y="0" width="2" height="78" />
          <rect x="21" y="0" width="4" height="78" />
          <rect x="28" y="0" width="3" height="78" />
          <rect x="34" y="0" width="6" height="78" />
          <rect x="43" y="0" width="2" height="78" />
          <rect x="48" y="0" width="4" height="78" />
          <rect x="55" y="0" width="3" height="78" />
          <rect x="61" y="0" width="5" height="78" />
          <rect x="69" y="0" width="2" height="78" />
          <rect x="74" y="0" width="4" height="78" />
          <rect x="81" y="0" width="3" height="78" />
          <rect x="87" y="0" width="6" height="78" />
          <rect x="96" y="0" width="2" height="78" />
          <rect x="101" y="0" width="4" height="78" />
          <rect x="108" y="0" width="3" height="78" />
          <rect x="114" y="0" width="4" height="78" />
        </g>
        {/* The downward arrow beneath it, same width as the barcode above. */}
        <path d="M0 90 H120 L60 150 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

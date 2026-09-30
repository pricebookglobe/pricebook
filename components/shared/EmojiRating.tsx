"use client";

// Replaces the old 5-star display and 5-star picker across the app, per
// request: ratings are shown/picked as a face emoji instead of stars, with
// each option sitting in its own circle so multiple options (the picker) or
// an emoji-plus-number summary (the display) read clearly at a glance.
export const RATING_EMOJI: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "😢",
  2: "😐",
  3: "🙂",
  4: "😊",
  5: "😄"
};

const RATING_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Sad — 1 star",
  2: "Plain — 2 stars",
  3: "Smiling — 3 stars",
  4: "Happy — 4 stars",
  5: "Very happy — 5 stars"
};

function clampRating(n: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;
}

// A single face-in-a-circle, used both by the display badge below and by
// the picker's five options, so the two always look like the same "thing".
function EmojiCircle({
  value,
  size,
  filled = true
}: {
  value: 1 | 2 | 3 | 4 | 5;
  size: number;
  filled?: boolean;
}) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full border " +
        (filled ? "border-value bg-value/10" : "border-line bg-field")
      }
      style={{ width: size, height: size, fontSize: size * 0.62 }}
      role="img"
      aria-label={RATING_LABEL[value]}
    >
      {RATING_EMOJI[value]}
    </span>
  );
}

// Drop-in replacement for the old <StarRating>: one emoji-in-a-circle for
// the rounded rating, plus the numeric average and review count, all on one
// horizontal line. `rating` of null (no ratings yet) shows a plain empty
// circle instead of guessing a face.
export function EmojiRating({
  rating,
  count,
  size = 22,
  showValue = true
}: {
  rating: number | null;
  count?: number;
  size?: number;
  showValue?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {rating === null ? (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-field text-ash"
          style={{ width: size, height: size }}
          role="img"
          aria-label="No ratings yet"
        >
          —
        </span>
      ) : (
        <EmojiCircle value={clampRating(rating)} size={size} />
      )}
      {showValue && rating !== null && <span className="font-mono text-sm text-ink">{rating.toFixed(1)}</span>}
      {typeof count === "number" && <span className="font-mono text-xs text-ash">({count})</span>}
    </span>
  );
}

// The 1-5 input control for leaving a review: all five faces laid out
// horizontally, side by side, on the same level, so picking a rating means
// tapping the face that matches how you feel rather than counting stars.
export function EmojiRatingPicker({
  value,
  onChange,
  size = 36
}: {
  value: number;
  onChange: (n: 1 | 2 | 3 | 4 | 5) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={RATING_LABEL[n]}
          aria-pressed={value === n}
          className={
            "flex items-center justify-center rounded-full border-2 transition-transform " +
            (value === n ? "scale-110 border-value bg-value/10" : "border-line bg-field hover:border-value/40")
          }
          style={{ width: size, height: size, fontSize: size * 0.55 }}
        >
          {RATING_EMOJI[n]}
        </button>
      ))}
    </div>
  );
}

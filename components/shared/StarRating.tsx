"use client";

import { useId } from "react";

const STAR_PATH =
  "M12 2.6l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.4l-5.8 3.05 1.11-6.47-4.7-4.58 6.49-.94L12 2.6z";

// A single star that can be partially filled (0 = empty outline, 1 = fully
// filled, anything between draws a hard vertical split at that fraction —
// used at 0.5 for half-stars). Built from one shared SVG path so the
// filled and empty glyphs are pixel-identical, not two different fonts'
// idea of a star drifting out of alignment with each other.
function Star({ fill, size }: { fill: number; size: number }) {
  const gradientId = useId();
  const pct = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${pct}%`} stopColor="#1F8A5F" />
          <stop offset={`${pct}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={STAR_PATH} fill="none" stroke="#5B6472" strokeOpacity={0.35} strokeWidth={1.2} />
      <path d={STAR_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

// Best-practice star display: rounds to the nearest half star (0.5
// increments) rather than showing a raw decimal or an unsegmented partial
// fill, which is the pattern shoppers already recognize from every other
// review-based product. Pass `count` to also show "(12)" next to it, and
// omit it (or pass 0) to render the 5-star outline "no ratings yet" state.
export function StarRating({
  rating,
  count,
  size = 16,
  showValue = true
}: {
  rating: number | null;
  count?: number;
  size?: number;
  showValue?: boolean;
}) {
  const rounded = rating === null ? 0 : Math.round(rating * 2) / 2;
  const stars = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, rounded - i)));

  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center" role="img" aria-label={rating !== null ? `${rating.toFixed(1)} out of 5 stars` : "No ratings yet"}>
        {stars.map((fill, i) => (
          <Star key={i} fill={fill} size={size} />
        ))}
      </span>
      {showValue && rating !== null && (
        <span className="font-mono text-sm text-ink">{rating.toFixed(1)}</span>
      )}
      {typeof count === "number" && (
        <span className="font-mono text-xs text-ash">({count})</span>
      )}
    </span>
  );
}

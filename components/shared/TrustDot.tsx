// Same thresholds used on the customer-facing store page: green above
// 90% of price reports confirmed correct, amber from 75% up to 90%, red
// below 75%. Grey when a store has no price reports at all yet — there's
// nothing to judge, so it shouldn't look good or bad.
export function TrustDot({ positivePct }: { positivePct: number | null | undefined }) {
  const pct = positivePct ?? null;
  const { color, label } =
    pct === null
      ? { color: "bg-ash/40", label: "No price reports yet" }
      : pct > 90
      ? { color: "bg-value", label: `${pct}% of price reports confirmed correct` }
      : pct >= 75
      ? { color: "bg-flag", label: `${pct}% of price reports confirmed correct` }
      : { color: "bg-red-600", label: `${pct}% of price reports confirmed correct` };

  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
      title={label}
      aria-label={label}
    />
  );
}

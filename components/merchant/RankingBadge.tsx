import type { RankingRow } from "@/lib/api";

export function RankingBadge({ row }: { row: RankingRow }) {
  const cheap = row.percentile <= 25;
  return (
    <div className="ledger-row">
      <span className="font-body text-[15px] text-ink">{row.category}</span>
      <span
        className={
          "font-display text-sm font-medium " + (cheap ? "text-value" : "text-ash")
        }
      >
        Top {Math.round(row.percentile)}% cheapest in your 5km zone
      </span>
    </div>
  );
}

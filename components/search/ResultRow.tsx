import type { SearchResult } from "@/lib/api";

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function ResultRow({ result, isCheapest }: { result: SearchResult; isCheapest: boolean }) {
  return (
    <div className="ledger-row">
      <div className="min-w-0">
        <div className="truncate font-display text-[15px] font-medium text-ink">{result.store_name}</div>
        <div className="font-mono text-xs text-ash">{formatDistance(result.distance_m)} away</div>
      </div>

      <div className="flex items-baseline gap-2">
        {isCheapest && (
          <span className="rounded-sm bg-value-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-value">
            Cheapest
          </span>
        )}
        <span className="font-display text-lg font-semibold text-ink">
          {result.price.toFixed(2)}
          <span className="ml-1 text-xs font-normal text-ash">JOD</span>
        </span>
      </div>
    </div>
  );
}

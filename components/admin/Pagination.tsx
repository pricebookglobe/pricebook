export const PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number): T[] {
  const start = page * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

export function Pagination({
  page,
  totalItems,
  onPageChange
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between font-mono text-xs text-ash">
      <span>
        Page {page + 1} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded-sm bg-ink px-3 py-1.5 font-medium text-field transition-colors hover:bg-value hover:text-white disabled:opacity-40"
        >
          ← Back
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="rounded-sm bg-value px-3 py-1.5 font-medium text-white hover:bg-value/90 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

"use client";

import { useLanguage } from "@/lib/i18n/LanguageProvider";

export const PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number, pageSize: number = PAGE_SIZE): T[] {
  const start = page * pageSize;
  return items.slice(start, start + pageSize);
}

export function Pagination({
  page,
  totalItems,
  onPageChange,
  pageSize = PAGE_SIZE
}: {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-3 flex items-center justify-between font-mono text-xs text-ash">
      <span>
        {t("Page")} {page + 1} {t("of")} {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded-sm bg-ink px-3 py-1.5 font-medium text-field transition-colors hover:bg-value hover:text-white active:bg-value active:text-white disabled:opacity-40"
        >
          ← {t("Back")}
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="rounded-sm bg-value px-3 py-1.5 font-medium text-white hover:bg-value/90 active:bg-value/90 disabled:opacity-40"
        >
          {t("Next")} →
        </button>
      </div>
    </div>
  );
}

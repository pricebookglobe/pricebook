"use client";

import type { RankingRow } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function RankingBadge({ row }: { row: RankingRow }) {
  const { t } = useLanguage();
  const cheap = row.percentile <= 25;
  return (
    <tr>
      <td>{row.category}</td>
      <td className={"num font-medium " + (cheap ? "text-value" : "text-ash")}>
        {t("Top")} {Math.round(row.percentile)}% {t("cheapest in your 5km zone")}
      </td>
    </tr>
  );
}

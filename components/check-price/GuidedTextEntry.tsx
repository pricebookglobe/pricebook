"use client";

import { useState } from "react";
import { CATEGORY_TREE } from "@/lib/categories";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function GuidedTextEntry({
  onSubmit,
  onCancel
}: {
  onSubmit: (structured: { product_name: string; category: string; size: number | null; unit: string | null }) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [unit, setUnit] = useState("");

  const group = CATEGORY_TREE.find((g) => g.name === category);

  return (
    <div className="flex flex-col gap-3 rounded border border-line bg-field-raised p-4">
      <label className="text-sm text-ash">
        {t("Category")}
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setSubcategory("");
          }}
          className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
        >
          <option value="">—</option>
          {CATEGORY_TREE.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      {group && (
        <label className="text-sm text-ash">
          {t("Category")} — {group.name}
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
          >
            <option value="">—</option>
            {group.subcategories.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}

      {subcategory && (
        <>
          <label className="text-sm text-ash">
            {t("Item")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("e.g. Al Ain fresh milk 1L")}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-ash">
              {t("Size")}
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
            <label className="text-sm text-ash">
              {t("Unit")}
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="L, kg, pcs…"
                className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
              />
            </label>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button
          disabled={!name.trim()}
          onClick={() =>
            onSubmit({
              product_name: name.trim(),
              category: subcategory || category,
              size: size ? parseFloat(size) : null,
              unit: unit || null
            })
          }
          className="rounded-sm bg-value px-4 py-2 font-display text-sm font-medium text-white transition-colors hover:bg-value/90 disabled:opacity-40"
        >
          {t("Find price")}
        </button>
        <button onClick={onCancel} className="rounded-sm px-4 py-2 font-display text-sm text-ash transition-colors hover:text-value">
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

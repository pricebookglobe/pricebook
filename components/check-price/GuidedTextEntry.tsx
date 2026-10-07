"use client";

import { useState } from "react";
import { CATEGORY_TREE } from "@/lib/categories";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { SizeValueInput } from "@/components/shared/SizeValueInput";
import {
  SIZE_TYPES,
  SIZE_TYPE_LABELS,
  SIZE_TYPE_UNITS,
  defaultUnitForSizeType,
  inferSizeType,
  type SizeType
} from "@/lib/productCategorization";

export function GuidedTextEntry({
  onSubmit,
  onCancel
}: {
  onSubmit: (structured: {
    product_name: string;
    category: string;
    size: number | null;
    unit: string | null;
    pack_size?: number | null;
    size_type?: SizeType | null;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [name, setName] = useState("");
  // Collapsed by default — most people don't know the exact pack/size
  // before they search, and forcing this field open just to try a search
  // is friction most would rather skip. Once results come back, mixed
  // pack sizes/sizes are disambiguated with filter chips instead (see
  // CheckPriceExperience.tsx) — this is only for someone who already
  // knows exactly what they're after and wants to skip straight to it.
  const [showSizeDetail, setShowSizeDetail] = useState(false);
  const [packSize, setPackSize] = useState("1");
  const [sizeType, setSizeType] = useState<SizeType>("units");
  const [sizeTypeManuallySet, setSizeTypeManuallySet] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [unit, setUnit] = useState(defaultUnitForSizeType("units"));

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
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                if (!sizeTypeManuallySet) {
                  const inferred = inferSizeType(value, subcategory || category);
                  setSizeType(inferred);
                  setUnit((u) => (SIZE_TYPE_UNITS[inferred].includes(u) ? u : defaultUnitForSizeType(inferred)));
                }
              }}
              placeholder={t("e.g. Al Ain fresh milk 1L")}
              className="mt-1 w-full rounded border border-line bg-field px-3 py-2 text-ink outline-none"
            />
          </label>

          {/* Optional and collapsed — see the state comment above for why.
              Opening it is only worth it for someone who already knows
              exactly what they want; everyone else disambiguates from the
              filter chips once results are back. */}
          {!showSizeDetail && (
            <button
              type="button"
              onClick={() => setShowSizeDetail(true)}
              className="self-start text-sm text-value underline hover:text-value/80"
            >
              {t("Know the exact size or pack? Add it (optional)")}
            </button>
          )}

          {showSizeDetail && (
            <div className="rounded border border-line bg-field p-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-ash">
                  {t("Pack size")}
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
                  />
                </label>
                <label className="text-xs text-ash">
                  {t("Size type")}
                  <select
                    value={sizeType}
                    onChange={(e) => {
                      const nextType = e.target.value as SizeType;
                      setSizeTypeManuallySet(true);
                      setSizeType(nextType);
                      setUnit(defaultUnitForSizeType(nextType));
                      if (nextType === "units") setSize(null);
                    }}
                    className="mt-1 w-full rounded border border-line bg-field-raised px-3 py-2 text-ink outline-none"
                  >
                    {SIZE_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {t(SIZE_TYPE_LABELS[st])}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {sizeType !== "units" && (
                <label className="mt-3 block text-xs text-ash">
                  {t("Size of one item in the pack")}
                  <SizeValueInput
                    value={size}
                    unit={unit}
                    options={SIZE_TYPE_UNITS[sizeType]}
                    onValueChange={setSize}
                    onUnitChange={setUnit}
                  />
                </label>
              )}
              <p className="mt-2 text-[11px] text-ash">
                {t("E.g. a 6-pack of 330ml cans: Pack size 6, Volume, 330 ml.")}
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          disabled={!name.trim()}
          onClick={() =>
            onSubmit({
              product_name: name.trim(),
              category: subcategory || category,
              size: sizeType !== "units" ? size : null,
              unit: sizeType !== "units" && size != null ? unit || null : null,
              // Only sent once the optional detail section was actually
              // opened and used — otherwise pack_size defaults to 1 on the
              // server anyway, no need to assert it here.
              pack_size: showSizeDetail ? parseInt(packSize, 10) || 1 : null,
              size_type: showSizeDetail ? sizeType : null
            })
          }
          className="btn-shine rounded-sm border border-value bg-value px-4 py-2 font-display text-sm font-medium text-white transition-all active:bg-value-dark disabled:opacity-40 hover:border-value-soft hover:text-white active:border-value-dark active:text-white duration-200 hover:scale-105"
        >
          {t("Find price")}
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-red-600 bg-red-600 px-4 py-2 font-display text-sm font-bold text-white transition-colors hover:border-red-700 hover:bg-red-700 active:border-red-800 active:bg-red-800"
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

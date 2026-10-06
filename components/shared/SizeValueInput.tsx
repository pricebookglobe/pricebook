"use client";

// A single visually-joined control for "how much of one unit" — a numeric
// value cell attached directly to a unit dropdown, rather than two
// separate, unrelated-looking fields. The unit dropdown's own options
// change with `sizeType` (its caller swaps them when the Size Type
// selector changes), so this component only ever shows units that make
// sense for whatever's currently selected — ml/L for Volume, g/kg for
// Weight, cm/m for Length, pcs for Units.
export function SizeValueInput({
  value,
  unit,
  options,
  onValueChange,
  onUnitChange,
  disabled
}: {
  value: number | null;
  unit: string;
  options: string[];
  onValueChange: (value: number | null) => void;
  onUnitChange: (unit: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-1 flex overflow-hidden rounded border border-line">
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value ? parseFloat(e.target.value) : null)}
        disabled={disabled}
        className="w-0 flex-1 bg-field px-3 py-2 text-ink outline-none disabled:opacity-60"
      />
      <select
        value={unit}
        onChange={(e) => onUnitChange(e.target.value)}
        disabled={disabled}
        aria-label="Unit"
        className="shrink-0 border-l border-line bg-field-raised px-2 py-2 text-sm text-ink outline-none disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

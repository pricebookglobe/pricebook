export function ClearableSearch({
  value,
  onChange,
  onClear,
  placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative flex-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-line bg-field px-3 py-2 pr-8 text-sm text-ink outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ash hover:text-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}

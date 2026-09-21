"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

type Props = {
  onSearch: (input: { text?: string; imageBase64?: string }) => void;
  busy?: boolean;
};

export function SearchBar({ onSearch, busy }: Props) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const imageBase64 = await fileToBase64(file);
    onSearch({ imageBase64 });
    e.target.value = "";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSearch({ text: text.trim() });
      }}
      className="flex items-center gap-2 rounded border border-line bg-field-raised px-3 py-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("Organic whole milk 1L, or a brand name…")}
        className="flex-1 bg-transparent font-body text-[15px] text-ink placeholder:text-ash outline-none"
        disabled={busy}
      />

      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={busy}
        className="rounded-sm px-2 py-1 text-sm text-ash hover:text-ink"
        aria-label="Snap a photo"
      >
        {t("Snap")}
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="rounded-sm px-2 py-1 text-sm text-ash hover:text-ink"
        aria-label="Upload a photo"
      >
        {t("Upload")}
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <button
        type="submit"
        disabled={busy || !text.trim()}
        className="rounded-sm bg-ink px-4 py-1.5 font-display text-sm font-medium text-field transition-colors hover:bg-value hover:text-white disabled:opacity-40"
      >
        {busy ? t("Searching…") : t("Find price")}
      </button>
    </form>
  );
}

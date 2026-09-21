"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { UI_STRINGS } from "./strings";

const RTL_HINTS = ["ar", "arabic", "he", "hebrew", "fa", "farsi", "persian", "ur", "urdu"];

type LanguageState = {
  language: string; // "English" or whatever the person picked/typed
  setLanguage: (lang: string) => void;
  t: (s: string) => string;
  loading: boolean;
  error: string | null;
};

const LanguageContext = createContext<LanguageState>({
  language: "English",
  setLanguage: () => {},
  t: (s) => s,
  loading: false,
  error: null
});

export function useLanguage() {
  return useContext(LanguageContext);
}

function cacheKey(lang: string) {
  return `pb_i18n_${lang.trim().toLowerCase()}`;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState("English");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore the person's last choice, including any cached translation.
  useEffect(() => {
    const saved = localStorage.getItem("pb_language");
    if (saved && saved !== "English") {
      setLanguageState(saved);
      const cached = localStorage.getItem(cacheKey(saved));
      if (cached) setTranslations(JSON.parse(cached));
    }
  }, []);

  useEffect(() => {
    const isRtl = RTL_HINTS.some((h) => language.toLowerCase().includes(h));
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = language === "English" ? "en" : language;
  }, [language]);

  async function setLanguage(lang: string) {
    setLanguageState(lang);
    localStorage.setItem("pb_language", lang);
    setError(null);

    if (lang === "English") {
      setTranslations({});
      return;
    }

    const cached = localStorage.getItem(cacheKey(lang));
    if (cached) {
      setTranslations(JSON.parse(cached));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage: lang, strings: UI_STRINGS })
      });
      if (res.ok) {
        const { translations: fresh } = await res.json();
        setTranslations(fresh);
        localStorage.setItem(cacheKey(lang), JSON.stringify(fresh));
      } else {
        setError(`Couldn't translate to ${lang} — try again in a moment.`);
      }
    } catch {
      setError(`Couldn't translate to ${lang} — check your connection and try again.`);
    } finally {
      setLoading(false);
    }
  }

  function t(s: string): string {
    return translations[s] ?? s;
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, loading, error }}>
      {children}
    </LanguageContext.Provider>
  );
}

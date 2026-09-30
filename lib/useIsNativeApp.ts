"use client";

import { useEffect, useState } from "react";

// True only when this page is running inside the packaged Android (or iOS)
// app — Capacitor's WebView injects a global `window.Capacitor` object there
// automatically, which an ordinary mobile or desktop browser never has. This
// lets the app show a native-style shell without changing how the website
// itself looks for anyone visiting it in a regular browser.
//
// Starts false (matches server-rendered markup) and flips right after mount
// once the check can run client-side, so there's no hydration mismatch.
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    setIsNative(Boolean(w.Capacitor?.isNativePlatform?.()));
  }, []);

  return isNative;
}

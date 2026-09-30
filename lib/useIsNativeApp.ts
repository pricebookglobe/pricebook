"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// useLayoutEffect runs synchronously right after React commits, before the
// browser paints anything — unlike useEffect, which runs after that paint.
// React warns if useLayoutEffect is called during server rendering (it does
// nothing there), so this falls back to useEffect on the server and only
// uses the layout version once running in a browser.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// True only when this page is running inside the packaged Android (or iOS)
// app — Capacitor's WebView injects a global `window.Capacitor` object there
// automatically, which an ordinary mobile or desktop browser never has. This
// lets the app show a native-style shell without changing how the website
// itself looks for anyone visiting it in a regular browser.
//
// Starts false (matches server-rendered markup, so there's no hydration
// mismatch) and flips as soon as the check can run client-side.
//
// This has to be a *layout* effect, not a plain effect: AppPage renders a
// whole different layout for isNative false vs true (website sidebar+footer
// vs. native top bar+bottom tab bar), and every page in the app is its own
// route, so switching tabs unmounts/remounts this hook from scratch each
// time. With a plain useEffect, the browser paints the false-layout frame
// (including the sidebar's red "Log out" button) BEFORE the effect can flip
// it to true — a real, visible flash on every single tab switch, not just
// on first load. A layout effect updates the state before that paint ever
// happens, so only the true native layout is ever actually shown once
// Capacitor is present.
export function useIsNativeApp(): boolean {
  const [isNative, setIsNative] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
    setIsNative(Boolean(w.Capacitor?.isNativePlatform?.()));
  }, []);

  return isNative;
}

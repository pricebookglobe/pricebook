"use client";

import { useEffect, useState } from "react";
import { SplashScreen } from "@capacitor/splash-screen";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { IntroAnimation } from "./IntroAnimation";

const SESSION_KEY = "pricebook:introPlayed";

// Shows the ~10s animated open (IntroAnimation) as the very first thing a
// person sees when the packaged app launches — the actual start page
// underneath (sign-in or the signed-in home) is already mounting behind
// it, so the moment the intro finishes/is skipped, the real app is right
// there with no extra load time. Native app only (this is about the app's
// launch experience specifically, not every website visit), and only once
// per app session — sessionStorage survives background/foreground but not
// a fresh cold start, which is exactly "once per launch".
export function IntroGate({ children }: { children: React.ReactNode }) {
  const isNativeApp = useIsNativeApp();
  const [showIntro, setShowIntro] = useState(false);
  const [checked, setChecked] = useState(false);

  // Dismiss the native splash screen (the old static logo screen covering
  // the gap while the remote site loads over the network) the instant this
  // component — i.e. the real web app — has mounted and is ready to paint,
  // so the handoff is straight into the intro animation below rather than
  // sitting on a separate logo screen first. capacitor.config.ts turns off
  // the plugin's own fixed timer (launchAutoHide: false) so this explicit
  // call is the only thing that ever hides it. A no-op outside the native
  // app (the plugin is only registered there).
  useEffect(() => {
    SplashScreen.hide().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNativeApp) {
      setChecked(true);
      return;
    }
    let alreadyPlayed = false;
    try {
      alreadyPlayed = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // storage unavailable — treat as not played, intro just shows once more than ideal
    }
    setShowIntro(!alreadyPlayed);
    setChecked(true);
  }, [isNativeApp]);

  function finishIntro() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // best-effort — worst case the intro plays again next launch
    }
    setShowIntro(false);
  }

  return (
    <>
      {children}
      {checked && showIntro && <IntroAnimation onFinished={finishIntro} />}
    </>
  );
}

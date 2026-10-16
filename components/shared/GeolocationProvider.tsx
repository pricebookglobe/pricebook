"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { currencyForCoords } from "@/lib/currency";

type Coords = { lat: number; lng: number } | null;
type GeoState = {
  coords: Coords;
  // How precise the current fix is, in meters, straight from the device
  // (GPS, Wi-Fi or cell-based — whatever the OS actually used). Null for a
  // manually-picked city, which has no meaningful accuracy radius. Used to
  // tell two nearby registered stores apart with confidence instead of
  // guessing — see find_nearest_store's accuracy_m parameter.
  accuracy: number | null;
  status: "loading" | "granted" | "denied" | "manual";
  currency: string;
  countryCode: string | null;
  setManualCity: (lat: number, lng: number) => void;
};

const GeoContext = createContext<GeoState>({
  coords: null,
  accuracy: null,
  status: "loading",
  currency: "USD",
  countryCode: null,
  setManualCity: () => {}
});

export function useGeolocation() {
  return useContext(GeoContext);
}

// A one-shot "get my precise position right now" used by the merchant
// store-location pickers (signup's "Use my location" / settings' "Update
// Location" — the exact coordinates a shopper is later matched against).
// Those two call sites used to call plain `navigator.geolocation.
// getCurrentPosition` directly, with no enableHighAccuracy flag and —
// critically — without ever going through Capacitor's native permission
// prompt first. That's the same WebView gap documented below on the
// watchPosition path: the device-wide Location toggle being on doesn't
// mean the app has been granted its own runtime permission, and the plain
// browser call has no way to trigger that native prompt itself. Depending
// on the Android version/OEM, the result ranged from a silent failure to
// a coarse network/cell-tower fix (accurate to hundreds of meters, not
// the handful of meters a storefront needs) — which is exactly how a
// store registered "in the middle of the mall" could end up pinned far
// enough off that a shopper standing on that same spot later doesn't
// register as being there at all. This goes through the same
// permission + high-accuracy GPS path watchPosition uses below, just as
// a single fresh fix instead of a running watch.
export async function getPreciseLocation(): Promise<{ lat: number; lng: number; accuracy: number | null }> {
  if (Capacitor.isNativePlatform()) {
    let perms = await Geolocation.checkPermissions();
    if (perms.location !== "granted") {
      perms = await Geolocation.requestPermissions();
    }
    if (perms.location !== "granted") {
      throw new Error("Location permission denied");
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000 });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null
    };
  }

  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation not supported");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null
        }),
      () => reject(new Error("Couldn't read your location")),
      // maximumAge: 0 forces a fresh fix instead of reusing a stale
      // cached one from before the merchant walked to the register/
      // storefront spot they actually want pinned.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });
}

// A single raw GPS reading can be off by anywhere from a few meters
// (clear sky, modern phone) to 50m+ (indoors, between tall buildings, cold
// start right after opening the app) — and consecutive readings jitter
// around even while standing still. Feeding that raw, jumpy fix straight
// into "which store is nearest" is exactly what let someone standing at
// store A get told they were at store C two doors down: a single noisy
// fix landed fractionally closer to C's registered coordinates than A's.
//
// Two mitigations, both standard practice for consumer GPS:
// - Drop a fix outright if it's drastically worse than what's already on
//   file (a momentary signal glitch) rather than letting one bad reading
//   override several good ones.
// - Keep a short rolling window of the last few good fixes and report an
//   inverse-variance-weighted average position instead of the single
//   latest one — a more accurate fix (lower reported accuracy number)
//   counts for more than a noisier one, and single-sample jitter mostly
//   cancels out across the window.
const SMOOTHING_WINDOW = 4;
// A fix reported as less precise than this is still kept for the
// smoothing window (better than nothing indoors), but never used alone to
// override an existing, meaningfully better position outright.
const DEGRADED_ACCURACY_M = 75;

type RawFix = { lat: number; lng: number; accuracy: number };

export function GeolocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coords>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [status, setStatus] = useState<GeoState["status"]>("loading");
  const [currency, setCurrency] = useState("USD");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const manualRef = useRef(false);
  const fixWindowRef = useRef<RawFix[]>([]);

  // Folds a new raw device fix into the rolling window and returns the
  // smoothed { lat, lng, accuracy } to actually expose to the rest of the
  // app. Kept outside React state so it's not subject to batching/stale
  // closures — called straight from the watchPosition callback.
  function smoothFix(fix: RawFix): RawFix {
    const window = fixWindowRef.current;

    // A fix wildly less precise than the best recent one is most likely a
    // momentary glitch (a lost satellite lock, a lift between cell towers)
    // rather than a genuine move to a much-less-accurate environment —
    // skip folding it in and keep reporting the last smoothed position,
    // so one bad sample can't yank the anchor around on its own.
    const bestRecent = window.length ? Math.min(...window.map((f) => f.accuracy)) : null;
    if (bestRecent !== null && fix.accuracy > DEGRADED_ACCURACY_M && fix.accuracy > bestRecent * 3) {
      return weightedAverage(window.length ? window : [fix]);
    }

    window.push(fix);
    if (window.length > SMOOTHING_WINDOW) window.shift();
    return weightedAverage(window);
  }

  function weightedAverage(fixes: RawFix[]): RawFix {
    if (fixes.length === 1) return fixes[0];
    // Inverse-variance weighting (weight ∝ 1/accuracy²) — a 5m-accurate fix
    // counts for 16x as much as a 20m-accurate one, so one sharp reading
    // dominates a handful of noisy ones instead of being averaged down to
    // meet them halfway.
    let wLat = 0;
    let wLng = 0;
    let wSum = 0;
    for (const f of fixes) {
      const w = 1 / Math.max(f.accuracy, 1) ** 2;
      wLat += f.lat * w;
      wLng += f.lng * w;
      wSum += w;
    }
    // Report the best individual accuracy in the window (the smoothed
    // position is at least that good, usually better) rather than a raw
    // average of accuracies, which would understate it.
    const bestAccuracy = Math.min(...fixes.map((f) => f.accuracy));
    return { lat: wLat / wSum, lng: wLng / wSum, accuracy: bestAccuracy };
  }

  useEffect(() => {
    let cancelled = false;
    let watchId: string | null = null;

    async function start() {
      // On Android/iOS, the device-wide "Location" toggle being on doesn't
      // mean THIS app has been granted permission to use it — that's a
      // separate, per-app runtime permission that only a native prompt can
      // grant (the plain browser `navigator.geolocation` call inside the
      // WebView has no way to trigger that prompt on its own, so without
      // this it silently fails forever and the app is stuck saying "turn
      // location on" no matter what the phone's Settings say).
      if (Capacitor.isNativePlatform()) {
        try {
          let perms = await Geolocation.checkPermissions();
          if (perms.location !== "granted") {
            perms = await Geolocation.requestPermissions();
          }
          if (perms.location !== "granted") {
            if (!cancelled) setStatus("denied");
            return;
          }
        } catch {
          if (!cancelled) setStatus("denied");
          return;
        }
      } else if (!("geolocation" in navigator)) {
        if (!cancelled) setStatus("denied");
        return;
      }

      // Keep the fix live as the shopper moves around, instead of reading
      // their position once at page load and never again — nearby-store
      // results (and the trust/price data tied to the store they're
      // standing in) stay current for as long as the app is open.
      try {
        // enableHighAccuracy asks for a GPS-based fix instead of the much
        // coarser (and much less reliable indoors/near buildings)
        // network/cell-tower estimate — the difference between being
        // accurate to a few meters and to a few hundred. That gap is
        // exactly what was making "you're at this store" fail for
        // shoppers standing right at a store's entrance: a loose fix put
        // them outside even a generous radius. maximumAge is dropped from
        // 15s to 5s so a stale cached fix from before the shopper walked
        // up to the store isn't reused for longer than necessary.
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
          (pos, err) => {
            if (cancelled || manualRef.current) return;
            if (err || !pos) {
              setStatus("denied");
              return;
            }
            const rawAccuracy = typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : DEGRADED_ACCURACY_M;
            const smoothed = smoothFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: rawAccuracy });
            setCoords({ lat: smoothed.lat, lng: smoothed.lng });
            setAccuracy(smoothed.accuracy);
            setStatus("granted");
          }
        );
      } catch {
        if (!cancelled) setStatus("denied");
      }
    }

    start();
    return () => {
      cancelled = true;
      if (watchId) Geolocation.clearWatch({ id: watchId }).catch(() => {});
    };
  }, []);

  // Resolve currency once we have coordinates, whichever way we got them.
  useEffect(() => {
    if (!coords) return;
    currencyForCoords(coords.lat, coords.lng).then(({ currency, countryCode }) => {
      setCurrency(currency);
      setCountryCode(countryCode);
    });
  }, [coords]);

  const setManualCity = (lat: number, lng: number) => {
    manualRef.current = true;
    fixWindowRef.current = [];
    setCoords({ lat, lng });
    setAccuracy(null);
    setStatus("manual");
  };

  return (
    <GeoContext.Provider value={{ coords, accuracy, status, currency, countryCode, setManualCity }}>
      {children}
    </GeoContext.Provider>
  );
}

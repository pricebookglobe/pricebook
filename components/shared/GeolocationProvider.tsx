"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { currencyForCoords } from "@/lib/currency";

type Coords = { lat: number; lng: number } | null;
type GeoState = {
  coords: Coords;
  status: "loading" | "granted" | "denied" | "manual";
  currency: string;
  countryCode: string | null;
  setManualCity: (lat: number, lng: number) => void;
};

const GeoContext = createContext<GeoState>({
  coords: null,
  status: "loading",
  currency: "USD",
  countryCode: null,
  setManualCity: () => {}
});

export function useGeolocation() {
  return useContext(GeoContext);
}

export function GeolocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coords>(null);
  const [status, setStatus] = useState<GeoState["status"]>("loading");
  const [currency, setCurrency] = useState("USD");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const manualRef = useRef(false);

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
        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 15000 },
          (pos, err) => {
            if (cancelled || manualRef.current) return;
            if (err || !pos) {
              setStatus("denied");
              return;
            }
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
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
    setCoords({ lat, lng });
    setStatus("manual");
  };

  return (
    <GeoContext.Provider value={{ coords, status, currency, countryCode, setManualCity }}>
      {children}
    </GeoContext.Provider>
  );
}

"use client";

import { createContext, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("granted");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 8000 }
    );
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
    setCoords({ lat, lng });
    setStatus("manual");
  };

  return (
    <GeoContext.Provider value={{ coords, status, currency, countryCode, setManualCity }}>
      {children}
    </GeoContext.Provider>
  );
}

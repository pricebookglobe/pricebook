"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Coords = { lat: number; lng: number } | null;
type GeoState = { coords: Coords; status: "loading" | "granted" | "denied" | "manual"; setManualCity: (lat: number, lng: number) => void };

const GeoContext = createContext<GeoState>({
  coords: null,
  status: "loading",
  setManualCity: () => {}
});

export function useGeolocation() {
  return useContext(GeoContext);
}

export function GeolocationProvider({ children }: { children: React.ReactNode }) {
  const [coords, setCoords] = useState<Coords>(null);
  const [status, setStatus] = useState<GeoState["status"]>("loading");

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

  const setManualCity = (lat: number, lng: number) => {
    setCoords({ lat, lng });
    setStatus("manual");
  };

  return (
    <GeoContext.Provider value={{ coords, status, setManualCity }}>
      {children}
    </GeoContext.Provider>
  );
}

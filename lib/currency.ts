"use client";

import { currencyForCountry } from "./countryCurrency";

/**
 * Reverse-geocodes lat/lng to a country code using OpenStreetMap's free
 * Nominatim API (no key needed, but be polite: this app calls it once per
 * session, not per keystroke). Falls back to USD if the lookup fails.
 */
export async function currencyForCoords(lat: number, lng: number): Promise<{ currency: string; countryCode: string | null }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error("reverse geocode failed");
    const data = await res.json();
    const countryCode: string | null = data?.address?.country_code
      ? data.address.country_code.toUpperCase()
      : null;
    return { currency: currencyForCountry(countryCode), countryCode };
  } catch {
    return { currency: "USD", countryCode: null };
  }
}

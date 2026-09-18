// ISO 3166-1 alpha-2 country code -> ISO 4217 currency code.
// Covers the countries PriceBook is most likely to launch in first;
// falls back to USD for anything not listed rather than failing.
export const COUNTRY_CURRENCY: Record<string, string> = {
  JO: "JOD", // Jordan
  SA: "SAR", // Saudi Arabia
  AE: "AED", // UAE
  EG: "EGP", // Egypt
  LB: "LBP", // Lebanon
  IQ: "IQD", // Iraq
  KW: "KWD", // Kuwait
  QA: "QAR", // Qatar
  BH: "BHD", // Bahrain
  OM: "OMR", // Oman
  PS: "ILS", // Palestine (shared currency with Israel in practice)
  IL: "ILS", // Israel
  TR: "TRY", // Turkey
  US: "USD",
  GB: "GBP",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  IN: "INR",
  PK: "PKR",
  CA: "CAD",
  AU: "AUD"
};

export function currencyForCountry(countryCode: string | null): string {
  if (!countryCode) return "USD";
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? "USD";
}

// A practical, extensible list — not every country has states/provinces
// modeled here (only where the concept is commonly used in addresses).
// City is always a free-text box rather than a dropdown, since an
// exhaustive city list per country/state isn't realistic to hand-author.
export type Country = { code: string; name: string; states?: string[] };

export const COUNTRIES: Country[] = [
  { code: "JO", name: "Jordan", states: ["Amman", "Irbid", "Zarqa", "Balqa", "Madaba", "Karak", "Mafraq", "Jerash", "Ajloun", "Ma'an", "Tafilah", "Aqaba"] },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates", states: ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"] },
  { code: "EG", name: "Egypt" },
  { code: "LB", name: "Lebanon" },
  { code: "IQ", name: "Iraq" },
  { code: "KW", name: "Kuwait" },
  { code: "QA", name: "Qatar" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
  { code: "PS", name: "Palestine" },
  { code: "SY", name: "Syria" },
  { code: "TR", name: "Turkey" },
  { code: "US", name: "United States", states: ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"] },
  { code: "CA", name: "Canada", states: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan"] },
  { code: "GB", name: "United Kingdom", states: ["England", "Scotland", "Wales", "Northern Ireland"] },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IN", name: "India", states: ["Andhra Pradesh", "Bihar", "Delhi", "Gujarat", "Karnataka", "Kerala", "Maharashtra", "Punjab", "Rajasthan", "Tamil Nadu", "Uttar Pradesh", "West Bengal"] },
  { code: "PK", name: "Pakistan" },
  { code: "AU", name: "Australia", states: ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "Northern Territory", "Australian Capital Territory"] },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" }
];

export function statesFor(countryCode: string): string[] | undefined {
  return COUNTRIES.find((c) => c.code === countryCode)?.states;
}

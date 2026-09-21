// A practical list of countries with their major cities — not
// exhaustive (no hand-authored list of every town in every country is
// realistic), but enough to cover where the large majority of signups
// will actually be from. Jordan gets the deepest list since it's this
// product's primary market; other countries get their handful of
// largest cities.
export type Country = { code: string; name: string; cities: string[] };

export const COUNTRIES: Country[] = [
  {
    code: "JO",
    name: "Jordan",
    cities: [
      "Amman", "Zarqa", "Irbid", "Russeifa", "Wadi as-Seer", "Aqaba", "Salt",
      "Madaba", "Mafraq", "Karak", "Jerash", "Ajloun", "Ma'an", "Tafilah",
      "Sahab", "Ramtha"
    ]
  },
  { code: "SA", name: "Saudi Arabia", cities: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar", "Taif", "Tabuk", "Abha", "Jubail"] },
  { code: "AE", name: "United Arab Emirates", cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Al Ain", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"] },
  { code: "EG", name: "Egypt", cities: ["Cairo", "Alexandria", "Giza", "Shubra El Kheima", "Port Said", "Suez", "Luxor", "Mansoura", "Tanta"] },
  { code: "LB", name: "Lebanon", cities: ["Beirut", "Tripoli", "Sidon", "Tyre", "Jounieh", "Zahle", "Baalbek"] },
  { code: "IQ", name: "Iraq", cities: ["Baghdad", "Basra", "Mosul", "Erbil", "Najaf", "Karbala", "Sulaymaniyah", "Kirkuk"] },
  { code: "KW", name: "Kuwait", cities: ["Kuwait City", "Hawalli", "Salmiya", "Farwaniya", "Jahra", "Ahmadi"] },
  { code: "QA", name: "Qatar", cities: ["Doha", "Al Rayyan", "Al Wakrah", "Al Khor", "Umm Salal"] },
  { code: "BH", name: "Bahrain", cities: ["Manama", "Riffa", "Muharraq", "Hamad Town", "A'ali"] },
  { code: "OM", name: "Oman", cities: ["Muscat", "Salalah", "Sohar", "Nizwa", "Sur"] },
  { code: "PS", name: "Palestine", cities: ["Gaza", "Hebron", "Nablus", "Ramallah", "Bethlehem", "Jenin", "Khan Yunis"] },
  { code: "SY", name: "Syria", cities: ["Damascus", "Aleppo", "Homs", "Latakia", "Hama", "Daraa"] },
  { code: "TR", name: "Turkey", cities: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Gaziantep", "Konya"] },
  { code: "US", name: "United States", cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "Austin"] },
  { code: "CA", name: "Canada", cities: ["Toronto", "Montreal", "Vancouver", "Calgary", "Edmonton", "Ottawa", "Winnipeg"] },
  { code: "GB", name: "United Kingdom", cities: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool", "Edinburgh", "Bristol"] },
  { code: "DE", name: "Germany", cities: ["Berlin", "Munich", "Hamburg", "Cologne", "Frankfurt", "Stuttgart"] },
  { code: "FR", name: "France", cities: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes"] },
  { code: "ES", name: "Spain", cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Malaga"] },
  { code: "IT", name: "Italy", cities: ["Rome", "Milan", "Naples", "Turin", "Palermo", "Bologna"] },
  { code: "IN", name: "India", cities: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune"] },
  { code: "PK", name: "Pakistan", cities: ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"] },
  { code: "AU", name: "Australia", cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra"] },
  { code: "CN", name: "China", cities: ["Shanghai", "Beijing", "Guangzhou", "Shenzhen", "Chengdu", "Hangzhou"] },
  { code: "JP", name: "Japan", cities: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Fukuoka"] }
];

export function citiesFor(countryCode: string): string[] {
  return COUNTRIES.find((c) => c.code === countryCode)?.cities ?? [];
}

"use client";

import { GeolocationProvider } from "@/components/shared/GeolocationProvider";

// Shared across every customer route (Check Price, Search Items, History,
// the customer home page). Next.js keeps a route group's layout mounted
// across navigations between its own routes — only the page inside it
// swaps — so putting GeolocationProvider here (instead of inside each
// page, as it used to be) means the location watch is started once and
// stays live as a shopper flips between Check Price and Search Items,
// rather than being torn down and restarted on every tab switch. A
// restarted watch has to wait for a fresh GPS fix from scratch each time,
// which was making "cheaper near you" results and the "you're at this
// store" check less accurate (or briefly wrong) right after switching
// tabs, on top of the wasted battery/radio churn.
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <GeolocationProvider>{children}</GeolocationProvider>;
}

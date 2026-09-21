import { redirect } from "next/navigation";

// Store login now lands on /overview instead — kept as a redirect (rather
// than deleting the route outright) in case anything old still links here
// (a bookmark, a stale link), so it can never show the old dashboard
// content again.
export default function LegacyDashboardRedirect() {
  redirect("/overview");
}

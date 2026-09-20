import { redirect } from "next/navigation";

// This resume-after-email-confirmation step is gone — merchant signup
// now creates the store immediately in one pass. Kept as a redirect only
// in case anything old still links here.
export default function LegacyStoreProfileRedirect() {
  redirect("/dashboard");
}

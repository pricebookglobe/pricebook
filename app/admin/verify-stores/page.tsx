import { redirect } from "next/navigation";

export default function LegacyAdminVerifyStoresRedirect() {
  redirect("/admin");
}

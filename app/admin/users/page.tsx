import { redirect } from "next/navigation";

export default function LegacyAdminUsersRedirect() {
  redirect("/admin");
}

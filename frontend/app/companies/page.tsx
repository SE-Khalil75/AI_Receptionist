// Redirects legacy /companies route to /settings
import { redirect } from "next/navigation";

export default function CompaniesRedirect() {
  redirect("/settings");
}

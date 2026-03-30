// Redirects legacy /companies/[id] route to /settings
import { redirect } from "next/navigation";

export default function CompanyDetailRedirect() {
  redirect("/settings");
}

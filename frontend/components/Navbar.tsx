"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const links = [
  { href: "/",             label: "Dashboard" },
  { href: "/appointments", label: "Appointments" },
  { href: "/settings",     label: "Settings" },
  { href: "/test",         label: "Test Agent" },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex items-center gap-8 px-4 max-w-7xl h-14">
        <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
          <span className="text-xl">📞</span>
          <span>AI Receptionist</span>
        </Link>
        <div className="flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

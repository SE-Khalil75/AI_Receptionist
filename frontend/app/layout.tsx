import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "AI Receptionist",
  description: "AI-powered phone receptionist for businesses",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
        <Sidebar />
        <main
          className="flex-1 min-h-screen overflow-y-auto"
          style={{ marginLeft: '240px', position: 'relative', zIndex: 1 }}
        >
          <div style={{ padding: '40px 48px', maxWidth: '1100px' }}>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

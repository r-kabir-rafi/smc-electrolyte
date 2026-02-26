import type { Metadata } from "next";
import Link from "next/link";
import ScrollEffects from "../components/scroll-effects";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMC Heatwave Risk Dashboard",
  description: "Bangladesh heatwave monitoring and health-risk intelligence platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ScrollEffects />
        <header className="top-nav">
          <div className="top-nav-inner">
            <Link href="/" className="brand-link">
              SMC Heatwave
            </Link>
            <nav className="menu-links">
              <Link href="/">Dashboard</Link>
              <Link href="/incidents">Incidents</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import AppShell from "../components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "HeatOps",
  description: "District-level heat, incident, and campaign intelligence dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-body">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

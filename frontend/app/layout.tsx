import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMC Heatwave Risk",
  description: "Bangladesh heatwave and health-risk intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

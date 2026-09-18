import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PriceBook — Track Best Prices",
  description: "Find the cheapest grocery prices near you, or manage your store's pricing."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Analyzer",
  description:
    "Research assistant for India and US stock ideas using news, technicals, fundamentals, and risk context.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

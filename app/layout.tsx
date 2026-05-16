import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Protected Analytics Reporting Layer",
  description: "A small sandbox showing aggregated article engagement reporting."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

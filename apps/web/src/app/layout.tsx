import type { Metadata, Viewport } from "next";
import { Caveat, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Portal TANIA — AI Employee for DPS",
    template: "%s · Portal TANIA",
  },
  description:
    "TANIA adalah AI Employee untuk Digital Product & Solution Telkom Indonesia: menjawab, menganalisis, membuat, dan mengotomasi pekerjaan dengan tata kelola yang dapat diaudit.",
};

export const viewport: Viewport = {
  // Exporting `viewport` replaces Next's default, so the device-width rule has
  // to be restated here — without it a phone lays the page out at 980px.
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b6fe0",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const outfit = localFont({ src: "./fonts/Outfit-Variable.ttf", weight: "100 900", variable: "--font-outfit", display: "swap" });
const nodesto = localFont({ src: "./fonts/NodestoCapsCondensed-Bold.otf", variable: "--font-nodesto", display: "swap" });
const tiny = localFont({ src: "./fonts/Tiny5-Regular.ttf", variable: "--font-tiny", display: "swap" });

export const metadata: Metadata = {
  title: "questlog: your GitHub profile, painted like a realm",
  description:
    "Pixel-art GitHub profile cards with a medieval feel: a character sheet, a spellbook of your languages and a fire for your streak. Paste one line, no setup.",
  icons: { icon: "/static/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0f0d14", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${nodesto.variable} ${tiny.variable}`}>
      <body>{children}</body>
    </html>
  );
}

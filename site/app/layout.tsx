import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { HOST } from "@/components/data";

const outfit = localFont({ src: "./fonts/Outfit-Variable.ttf", weight: "100 900", variable: "--font-outfit", display: "swap" });
const nodesto = localFont({ src: "./fonts/NodestoCapsCondensed-Bold.otf", variable: "--font-nodesto", display: "swap" });
const silk = localFont({ src: "./fonts/Silkscreen-Bold.woff2", weight: "700", variable: "--font-mark", display: "swap" });
const tiny = localFont({ src: "./fonts/Tiny5-Regular.ttf", variable: "--font-tiny", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(HOST),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "questlog",
    title: "questlog: pixel-art GitHub profile cards",
    description: "Pixel-art cards for your GitHub profile README: stats, languages and streak in 16 painted scenes.",
    images: [{ url: "/demo/stats?scene=castle-sky", width: 1600, height: 640, alt: "A questlog Character Sheet" }],
  },
  title: "questlog: pixel-art GitHub profile cards",
  description:
    "Pixel-art cards for your GitHub profile README: a character sheet of your stats, a spellbook of your languages and a fire for your streak, in 16 painted scenes.",
  icons: { icon: "/static/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0f0d14", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${nodesto.variable} ${tiny.variable} ${silk.variable}`}>
      <body>{children}</body>
    </html>
  );
}

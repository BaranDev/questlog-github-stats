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
    title: "questlog: pixel art GitHub profile cards",
    description: "Pixel art cards for your GitHub profile README: stats, languages and streak in 16 painted scenes.",
    images: [{ url: "/demo/stats?scene=castle-sky", width: 1600, height: 640, alt: "A questlog Character Sheet" }],
  },
  title: "questlog: pixel art GitHub profile cards",
  description:
    "Pixel art cards for your GitHub profile README: a character sheet of your stats, a spellbook of your languages and a fire for your streak, in 16 painted scenes.",
  icons: { icon: "/static/favicon.svg" },
};

const FAILED_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 256'><rect width='640' height='256' rx='12' fill='#17141f'/><rect x='1' y='1' width='638' height='254' rx='11' fill='none' stroke='#f5dea0' stroke-opacity='.35' stroke-width='2'/><text x='320' y='120' fill='#f2e6c9' font-family='system-ui,sans-serif' font-size='26' text-anchor='middle'>This card did not load.</text><text x='320' y='158' fill='#f2e6c9' fill-opacity='.7' font-family='system-ui,sans-serif' font-size='22' text-anchor='middle'>Reload the page to try again.</text></svg>";
const FAILED_CARD = `document.addEventListener("error",function(e){var i=e.target;if(!i||i.tagName!=="IMG"||i.src.indexOf("data:")===0)return;try{var u=new URL(i.src);if(u.origin!==location.origin||!/\\/(stats|languages|streak)\\//.test(u.pathname+"/"))return}catch(_){return}i.src="data:image/svg+xml,"+encodeURIComponent(${JSON.stringify(FAILED_SVG)})},true)`;

export const viewport: Viewport = { themeColor: "#0f0d14", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${nodesto.variable} ${tiny.variable} ${silk.variable}`}>
      <body>
        {/* a card that fails to load says so in plain words instead of showing a broken image */}
        <script dangerouslySetInnerHTML={{ __html: FAILED_CARD }} />
        {children}
      </body>
    </html>
  );
}

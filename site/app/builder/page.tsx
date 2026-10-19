import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ProfileBuilder from "@/components/builder/ProfileBuilder";

export const metadata: Metadata = {
  title: "questlog profile builder: your GitHub README with pixel-art cards",
  description:
    "Write your GitHub profile README, add pixel-art cards for your stats, languages and streak, and see it the way GitHub will show it, in light and dark.",
  alternates: { canonical: "/builder" },
  openGraph: {
    url: "/builder",
    title: "questlog profile builder",
    description: "Your GitHub profile README with pixel-art cards, in four steps.",
  },
};

export default function BuilderPage() {
  return (
    <>
      <a className="skip" href="#top">
        Skip to content
      </a>
      <Nav still />
      <main id="top">
        <ProfileBuilder />
        <noscript>
          <p style={{ width: "min(100% - 32px, 40rem)", margin: "0 auto 3rem" }}>
            The builder needs JavaScript. The <a href="/wiki#getting-started">wiki</a> shows how to write the card lines by
            hand.
          </p>
        </noscript>
      </main>
      <Footer />
    </>
  );
}

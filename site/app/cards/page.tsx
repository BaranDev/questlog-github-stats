import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AllCards from "@/components/AllCards";

export const metadata: Metadata = {
  title: "All questlog cards: every scene, time and pixel style",
  description: "Every questlog card in one place: pick a scene and see all of its cards by day and by night, in fine and chunky pixels, with every fire and board.",
  alternates: { canonical: "/cards" },
  openGraph: { url: "/cards", title: "All questlog cards", description: "Every card in every scene, time and pixel style." },
};

export default function CardsPage() {
  return (
    <>
      <a className="skip" href="#top">
        Skip to content
      </a>
      <Nav />
      <main id="top">
        <AllCards />
      </main>
      <Footer />
    </>
  );
}

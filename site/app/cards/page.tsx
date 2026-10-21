import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import AllCards from "@/components/AllCards";
import { m } from "@/i18n";

export const metadata: Metadata = {
  title: m.meta.cards.title,
  description: m.meta.cards.description,
  alternates: { canonical: "/cards" },
  openGraph: { url: "/cards", title: m.meta.cards.ogTitle, description: m.meta.cards.ogDescription },
};

export default function CardsPage() {
  return (
    <>
      <a className="skip" href="#top">
        {m.site.skip}
      </a>
      <Nav />
      <main id="top">
        <AllCards />
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ProfileBuilder from "@/components/builder/ProfileBuilder";
import { m, rich } from "@/i18n";

export const metadata: Metadata = {
  title: m.meta.builder.title,
  description: m.meta.builder.description,
  alternates: { canonical: "/builder" },
  openGraph: {
    url: "/builder",
    title: m.meta.builder.ogTitle,
    description: m.meta.builder.ogDescription,
  },
};

export default function BuilderPage() {
  return (
    <>
      <a className="skip" href="#top">
        {m.site.skip}
      </a>
      <Nav still />
      <main id="top">
        <ProfileBuilder />
        <noscript>
          <p style={{ width: "min(100% - 32px, 40rem)", margin: "0 auto 3rem" }}>
            {rich(m.site.noscript.builder, { wiki: (c) => <a href="/wiki#getting-started">{c}</a> })}
          </p>
        </noscript>
      </main>
      <Footer />
    </>
  );
}

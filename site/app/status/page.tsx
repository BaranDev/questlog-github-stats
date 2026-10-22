import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Health from "@/components/Health";
import { m, rich } from "@/i18n";
import { ogImages } from "@/components/data";

export const metadata: Metadata = {
  title: m.meta.status.title,
  description: m.meta.status.description,
  alternates: { canonical: "/status" },
  openGraph: {
    url: "/status",
    title: m.meta.status.ogTitle,
    description: m.meta.status.ogDescription,
    images: ogImages("status", m.meta.status.ogImageAlt),
  },
};

export default function StatusPage() {
  return (
    <>
      <a className="skip" href="#top">
        {m.site.skip}
      </a>
      <Nav />
      <main id="top">
        <Health />
        <noscript>
          <p style={{ width: "min(100% - 32px, 40rem)", margin: "0 auto 3rem" }}>
            {rich(m.site.noscript.status, { health: (c) => <a href="/health">{c}</a> })}
          </p>
        </noscript>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { m, rich } from "@/i18n";
import { ogImages } from "@/components/data";
import p from "./privacy.module.css";

const P = m.privacy;

export const metadata: Metadata = {
  title: P.meta.title,
  description: P.meta.description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: P.meta.ogTitle,
    description: P.meta.ogDescription,
    images: ogImages("home", P.meta.ogImageAlt),
  },
};

const MAIL = "mailto:contact@cevdetbaran.com";
const GITHUB = "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement";
const CLOUDFLARE = "https://www.cloudflare.com/privacypolicy/";

export default function PrivacyPage() {
  return (
    <>
      <a className="skip" href="#top">
        {m.site.skip}
      </a>
      <Nav />
      <main id="top" className={p.page}>
        <header className={p.head}>
          <h1 className="display">{P.title}</h1>
          <p className="lede">{P.lede}</p>
          <p className={p.updated}>{P.updated}</p>
        </header>
        {P.sections.map((s) => (
          <section key={s.id} id={s.id} className={p.part} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`}>{s.title}</h2>
            {s.body.map((b, i) => (
              <p key={i}>
                {rich(b, {
                  strong: (c) => <strong>{c}</strong>,
                  mail: (c) => <a href={MAIL}>{c}</a>,
                  gh: (c) => <a href={GITHUB}>{c}</a>,
                  cf: (c) => <a href={CLOUDFLARE}>{c}</a>,
                })}
              </p>
            ))}
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}

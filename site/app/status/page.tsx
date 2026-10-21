import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Health from "@/components/Health";

export const metadata: Metadata = {
  title: "questlog health: is the service up, and how busy is it",
  description: "Live health of questlog: whether cards are served, whether stats arrive from GitHub, and whether new users get in right now.",
  alternates: { canonical: "/status" },
  openGraph: { url: "/status", title: "questlog health", description: "Live health of the questlog card service." },
};

export default function StatusPage() {
  return (
    <>
      <a className="skip" href="#top">
        Skip to content
      </a>
      <Nav />
      <main id="top">
        <Health />
        <noscript>
          <p style={{ width: "min(100% - 32px, 40rem)", margin: "0 auto 3rem" }}>
            This page needs JavaScript. The same is at <a href="/health">/health</a>.
          </p>
        </noscript>
      </main>
      <Footer />
    </>
  );
}

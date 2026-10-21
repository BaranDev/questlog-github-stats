import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Health from "@/components/Health";
import { m } from "@/i18n";

// Behind Cloudflare Access; not indexed or linked from the site.
export const metadata: Metadata = {
  title: m.meta.adminStatus.title,
  robots: { index: false, follow: false },
};

export default function AdminStatusPage() {
  return (
    <>
      <Nav still />
      <main id="top">
        <Health full />
      </main>
    </>
  );
}

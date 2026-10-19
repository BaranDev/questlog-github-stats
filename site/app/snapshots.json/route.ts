import { THUMBS } from "@/components/builder/cards";

// The card addresses the pages build in the browser, written out at build time for scripts/snap_cards.py; the
// pages' other cards are found in their HTML.
export const dynamic = "force-static";

export function GET() {
  return Response.json(THUMBS);
}

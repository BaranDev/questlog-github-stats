# Changelog

## 1.2.0

- **All cards** at [questlog.cc/cards](https://questlog.cc/cards): every card in every scene, every fire size in classic and themed fire, and every decoration, by day and night in fine and chunky pixels. Clicking one opens a preview with copy and open actions.
- **Profile builder:**
  - The first step asks whether it's for a GitHub profile or something else (a website, a blog, any Markdown file). Something else needs no login and offers the decorations.
  - Templates: Simple, Some details and The most detailed. Back to my README restores the README you started from.
  - Start over, next to Undo.
  - "Profile builder" in the nav and footer.
- **Previews on the wiki:** every card and decoration image opens the same preview as the builder.
- **Fine-pixel fires and decorations:** fine cards draw the fire at full detail, and `reading-nook`, `workbench`, `raven-moon` and `enchanted-clearing` are repainted at full detail, by day and by night.
- **Share images** for every page, plus `robots.txt` and a sitemap.
- **Privacy page** at [questlog.cc/privacy](https://questlog.cc/privacy): what is kept, why, for how long, and how to have it removed. It is linked from the footer and the builder.
- **Removal on request:** a removed login's saved stats are deleted, it is never fetched again, and its cards say they're not shown.
- **People on the admin page:** who has used the instance, with their saved stats and card addresses, 5 per page with search. No IPs are kept, and entries are forgotten after 12 months.
- **No credit line needed** on your own profile when you use the cards from questlog.cc.
- Dependency updates: Next.js 16.4.5, tokio, rustls, skrifa, lucide-react, gsap and marked.

## 1.1.0

- **Cards are WebP:** lossless, animated where they move, about a third of the size of the PNGs before, pixel for pixel the same.
- **Decorations** at `/decorations/<name>`: painted banners for README sections, with an optional title (`reading-nook`, `workbench`, `raven-moon`, `enchanted-clearing`, `crystal-owl`, `forest-divider`, `forest-footer`).
- **Chunky pixels:** `pixels=chunky` draws any card's or decoration's painting in pixels twice as big. The profile builder has a Fine / Chunky switch for every card at once, and each card can still have its own (the switch then says Mixed).
- **Guided tour** in the profile builder: once the first card is in, a short, skippable tour points out what each part does.
- **Spellbook runes** keep a 1 px gap between rows, and their sparkles pass behind them.
- **Decorations by night:** every decoration has a night painting (`time=night`), and the profile builder can switch them with dark mode like the cards.
- **Status page** at [questlog.cc/status](https://questlog.cc/status): whether cards are served, whether stats arrive from GitHub, and whether new users get in right now, with times in UTC.
- **Readable logs** for whoever runs an instance: one plain line per request and per background event, and an admin page behind Cloudflare Access (see "Watching it" in the README).

## 1.0.0

The first release.

- **Three cards:** the Character Sheet (`/stats`), the Spellbook (`/languages`, top 3 or 5) and the Campfire (`/streak`), each in 16 painted scenes, by day and by night.
- **Fires** that grow with your streak, in the classic flame or the scene's own colors (`fire=themed`).
- **Short addresses:** `/octocat/stats/forest-misty/night`, beside the long form `/stats?user=octocat&scene=forest-misty&time=night`.
- **Your own words:** title, subtitle, row names, values, a two-line note, colors and hidden rows.
- **Profile builder** at [questlog.cc/builder](https://questlog.cc/builder): starts from your profile README, adds cards at the cursor, changes a card when you click it, and shows the result the way GitHub will.
- **Titles** drawn with pixels half the size of the painting's, so the big letters read cleanly.
- **Built for load:** finished cards kept in memory and on disk, a per-IP limit on new drawings, and a site that ships its own copies of every card it shows.

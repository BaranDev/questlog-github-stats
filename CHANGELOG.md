# Changelog

## Unreleased

- **Cards are WebP:** lossless, animated where they move, about a third of the size of the PNGs before, pixel for pixel the same.
- **Decorations** at `/decorations/<name>`: painted banners for README sections, with an optional title (`reading-nook`, `workbench`, `raven-moon`, `enchanted-clearing`, `forest-divider`).

## 1.0.0

The first release.

- **Three cards:** the Character Sheet (`/stats`), the Spellbook (`/languages`, top 3 or 5) and the Campfire (`/streak`), each in 16 painted scenes, by day and by night.
- **Fires** that grow with your streak, in the classic flame or the scene's own colors (`fire=themed`).
- **Short addresses:** `/octocat/stats/forest-misty/night`, beside the long form `/stats?user=octocat&scene=forest-misty&time=night`.
- **Your own words:** title, subtitle, row names, values, a two-line note, colors and hidden rows.
- **Profile builder** at [questlog.cc/builder](https://questlog.cc/builder): starts from your profile README, adds cards at the cursor, changes a card when you click it, and shows the result the way GitHub will.
- **Titles** drawn with pixels half the size of the painting's, so the big letters read cleanly.
- **Built for load:** finished cards kept in memory and on disk, a per-IP limit on new drawings, and a site that ships its own copies of every card it shows.

# Contributing

Thanks for wanting to help. Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Small fixes** (a typo, a wrong number, a broken link): open a pull request directly.
- **Anything bigger** (a new option, a change to how a card looks, a new scene): open an issue first, so we can agree on it before you spend time on it.
- **Security problems:** see [SECURITY.md](SECURITY.md) and report them privately.

Every pull request is reviewed by the maintainer before it is merged.

## Running it locally

You need Rust (stable), Node 22 and a GitHub token that can read public repositories.

```bash
cd site && npm ci && npm run build && cd ..   # the pages, written to static/
cargo test --release                          # the server's tests and the pixel goldens
GITHUB_TOKEN=... DATA_DIR=./tmp-data PORT=8080 HOST=127.0.0.1 cargo run --release
```

Then open http://127.0.0.1:8080. Every `/demo/...` card works without a token.

- `src/` is the card server (Rust, axum): `server/` answers requests (`admin.rs` checks the admin login), `widgets/` draws the three cards, `decorations.rs` the banners, `card.rs`, `canvas.rs`, `text.rs` and `raster.rs` draw pixels, `github.rs` and `queue.rs` fetch stats, `log.rs` writes the log lines.
- `site/` is the website (Next.js static export): the home page, the wiki, the profile builder and the status pages.
- `art/` holds the paintings and their layout files, one folder per scene, and `art/decorations/` the banners by day and night.
- `tests/goldens/` holds the expected pixels of every card.

## Changing how cards look

Cards are compared pixel by pixel with `tests/goldens/`. When you change the drawing or the art on purpose:

1. Re-record the goldens: `UPDATE_GOLDENS=1 cargo test --release --test goldens`, then look at the changed images.
2. Draw the site's own card copies again: with a local server of your build running, `uv run site/scripts/snap_cards.py http://127.0.0.1:8080`, then `npm run build` in `site/` once more.
3. Put before and after screenshots in the pull request, by day and by night.

## Style

- Rust: `cargo fmt`, and comments that say why, not what.
- Site copy: plain, short sentences that someone new to GitHub profiles understands. No em dashes.
- Keep pull requests focused on one change.

## Art

The paintings are under CC BY-NC 4.0 (see [ART-LICENSE.md](ART-LICENSE.md)), separate from the MIT code. By contributing art you agree to license it the same way.

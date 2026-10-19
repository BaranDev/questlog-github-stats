## What this changes

<!-- One or two sentences, and the issue it closes if there is one. -->

## How I checked it

- [ ] `cd site && npm run build`, then `cargo test --release` pass
- [ ] Cards I changed look right (screenshots below), day and night
- [ ] If the art or the drawing changed: goldens re-recorded (`UPDATE_GOLDENS=1 cargo test --test goldens`) and the site's card copies drawn again (`uv run site/scripts/snap_cards.py`)

## Screenshots

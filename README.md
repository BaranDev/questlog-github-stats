# questlog-github-stats

Pixel-art GitHub profile cards with a medieval feel. Paste one line into your profile README: no token, no workflow, no setup.

| Card | Shows |
|---|---|
| `/stats` | level (from lifetime contributions), commits, PRs, repos, stars, issues, reviews, followers, contributions |
| `/languages` | your top five languages |
| `/streak` | current and best streak, total contributions |

## Use it

Open https://questlog.cevdetbaran.com, type your login and copy the snippet. Or write it yourself:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://questlog.cevdetbaran.com/stats?user=octocat&time=night">
  <img alt="octocat's stats" src="https://questlog.cevdetbaran.com/stats?user=octocat&time=day">
</picture>
```

The first time a card is requested, you'll see a "the scribe is inking your sheet" card for a few seconds while your stats are fetched. Refresh and it's there. Cards update every 12 hours.

## Options

| Parameter | Values | Default |
|---|---|---|
| `user` | your GitHub login | required |
| `scene` | `forest` | `forest` |
| `time` | `day`, `night` | `day` |
| `title` | any text | the scene's title |
| `subtitle` | any text | `/stats`: a class from your top language |
| `labels` | `key:Text,key:Text`, e.g. `commits:Deeds` | the scene's labels |
| `hide` | comma list, e.g. `prs,stars` or `html,css` on `/languages` | none |
| `animate` | `true`, `false` | `true` |

Only public data is shown. Private contributions count if you've enabled "Include private contributions" in your GitHub profile settings.

## Run your own

```bash
docker build -t questlog .
docker run -d -p 8080:8080 -e GITHUB_TOKEN=<a token with public read access> -v questlog-data:/data questlog
```

The server listens on `PORT` (8080) and keeps its cache in `DATA_DIR` (`/data`). With your own token, your own instance can count your private contributions too.

## License

Code: MIT (see `LICENSE`). Art: CC BY 4.0 (see `ART-LICENSE.md`). Fonts: see `fonts/README.md`.

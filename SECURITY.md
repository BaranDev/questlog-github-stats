# Security

## Reporting a problem

Please report security problems privately, not in a public issue:

- through GitHub: [Report a vulnerability](https://github.com/BaranDev/questlog-github-stats/security/advisories/new), or
- by email: contact@cevdetbaran.com

Say what you found, how to reproduce it, and what someone could do with it. You will get an answer within a week. Please give us a reasonable time to fix it before you talk about it publicly.

## What counts

The hosted service at questlog.cc and the code in this repository: for example a way to read data that is not public, to make the server fetch or show something it should not, to use the server against someone else, or to take it down with little effort. The admin pages (`/admin/status`, `/admin/health`) are meant to open only for the owner's Cloudflare Access login; any way in without it counts.

Things that are not security problems: the public stats a card shows (they come from public GitHub data), and the per-IP limit on new drawings answering "busy".

## Supported versions

Only the latest version on `main`, which is what questlog.cc runs.

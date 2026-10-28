// The privacy page: what questlog keeps, why, for how long, and how to have it removed.

export const privacy = {
  meta: {
    title: "Privacy: what questlog keeps and why",
    description: "What questlog keeps about the GitHub logins it draws cards for, why, for how long, and how to have it removed.",
    ogTitle: "questlog privacy",
    ogDescription: "What questlog keeps, why, for how long, and how to have it removed.",
    ogImageAlt: "questlog, pixel art cards for your GitHub profile",
  },
  title: "Privacy",
  updated: "Last updated on 28 October 2026.",
  lede: "questlog draws pixel art cards from public GitHub data. This page says what it keeps, why, for how long, and how to have it removed.",
  sections: [
    {
      id: "who",
      title: "Who runs questlog",
      body: [
        "questlog is run by Cevdet Baran Oral (BaranDev), who decides what is kept and why. Write to <mail>contact@cevdetbaran.com</mail> about anything on this page.",
      ],
    },
    {
      id: "kept",
      title: "What questlog keeps",
      body: [
        "<strong>Public GitHub numbers.</strong> When a card for a login is asked for, questlog reads that login's public numbers from GitHub (commits, pull requests, issues, reviews, stars, followers, languages and contribution days) and saves them to draw the card. They are read again every 12 hours while the card is in use, and deleted after 30 days with no request.",
        "<strong>Who has used it.</strong> A list only the owner sees: each login a card was made for, the card addresses asked for, when they were first and last asked for, and whether the card sits in a README or was opened in a browser. Bots are left out. It shows how many people use questlog. Each entry is deleted 12 months after its last request.",
        "<strong>Decorations.</strong> For banners made without a login, only the banner's address is kept, with no name attached.",
        "<strong>Server logs.</strong> Each request's address, time and answer, the kind of client (such as a browser on Windows, or GitHub's image proxy), the country Cloudflare reports, and Cloudflare's request id. They help keep the service running and find faults. The log has a fixed size, so old lines are overwritten, usually within a few weeks.",
        "<strong>Your IP address</strong> is held in memory for up to an hour, to limit how many new logins and fresh cards one address can ask for. It is never written to disk or to the log.",
        "<strong>Finished cards.</strong> Drawn card pictures are cached so they need not be drawn again. The cache drops the oldest pictures as it fills, and is emptied with each new version of questlog.",
      ],
    },
    {
      id: "not",
      title: "What it does not do",
      body: [
        "No cookies, no analytics or tracking scripts, and no ads. Nothing is sold or shared, and the list of who has used questlog is never used to contact anyone. Fonts and pictures come from questlog itself.",
      ],
    },
    {
      id: "browser",
      title: "In your browser",
      body: [
        "The profile builder keeps your draft in your browser's local storage, on your device only. Start over deletes it.",
        "To look up a login and its profile README, the builder asks GitHub directly from your browser (api.github.com, raw.githubusercontent.com, and github.com for avatars). Those requests are covered by <gh>GitHub's privacy statement</gh>.",
      ],
    },
    {
      id: "others",
      title: "Who else handles it",
      body: [
        "<strong>Cloudflare</strong> sits in front of the site as its network and cache, and sees your IP address as any web host would (<cf>Cloudflare's privacy policy</cf>).",
        "<strong>netcup</strong> hosts the server, in Germany.",
        "<strong>GitHub</strong> is the source of the numbers, and shows the cards in READMEs through its image proxy.",
        "Cloudflare and GitHub are based in the United States and may handle data there, under their own safeguards.",
      ],
    },
    {
      id: "why",
      title: "Why this is allowed",
      body: [
        "questlog relies on legitimate interest (Article 6(1)(f) of the GDPR): drawing the cards people ask for, keeping the service running and safe, and knowing how many people use it. It uses only public data, and no more than it needs.",
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      body: [
        "You can ask what questlog keeps about your login, have it removed, or object to its use. Write to <mail>contact@cevdetbaran.com</mail> with your GitHub login; you may be asked to show that the login is yours.",
        "Removal deletes the saved numbers and the login's entry in the list, and questlog stops drawing cards for that login: a card left in a README then shows a short notice instead. Copies already in caches run out within two days.",
        "You can also complain to a data protection authority, such as the one where you live.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      body: ["When this page changes, the date at the top changes with it."],
    },
  ],
};

// The site's frame (skip link, nav, footer), the page metadata, the home page and the names of scenes, cards and
// decorations that every page uses.

export const site = {
  skip: "Skip to content",
  nav: {
    home: "questlog home",
    label: "Main",
    makeCards: "Make cards",
    scenes: "Scenes",
    allCards: "All cards",
    wiki: "Wiki",
    github: "GitHub",
  },
  footer: {
    label: "Footer",
    makeCards: "Make my cards",
    scenes: "Scenes",
    allCards: "All cards",
    wiki: "Wiki",
    health: "Health",
    github: "GitHub",
    fine: "<home>questlog</home> by Cevdet Baran Oral. Code under the <mit>MIT license</mit>, paintings under <cc>CC BY-NC 4.0</cc> (commercial use needs permission).",
  },
  /** The picture a card that failed to load is swapped for. */
  failedCard: { title: "This card did not load.", hint: "Reload the page to try again." },
  noscript: {
    builder: "The builder needs JavaScript. The <wiki>wiki</wiki> shows how to write the card lines by hand.",
    status: "This page needs JavaScript. The same is at <health>/health</health>.",
  },
};

export const meta = {
  home: {
    title: "questlog: pixel art GitHub profile cards",
    description:
      "Pixel art cards for your GitHub profile README: a character sheet of your stats, a spellbook of your languages and a fire for your streak, in 16 painted scenes.",
    siteName: "questlog",
    ogTitle: "questlog: pixel art GitHub profile cards",
    ogDescription: "Pixel art cards for your GitHub profile README: stats, languages and streak in 16 painted scenes.",
    ogImageAlt: "A questlog Character Sheet",
  },
  builder: {
    title: "questlog profile builder: your GitHub README with pixel art cards",
    description:
      "Write your GitHub profile README, add pixel art cards for your stats, languages and streak, and see it the way GitHub will show it, in light and dark.",
    ogTitle: "questlog profile builder",
    ogDescription: "Your GitHub profile README with pixel art cards, in four steps.",
  },
  cards: {
    title: "All questlog cards: every scene, time and pixel style",
    description:
      "Every questlog card in one place: pick a scene and see all of its cards by day and by night, in fine and chunky pixels, with every fire and board.",
    ogTitle: "All questlog cards",
    ogDescription: "Every card in every scene, time and pixel style.",
  },
  status: {
    title: "questlog health: is the service up, and how busy is it",
    description:
      "Live health of questlog: whether cards are served, whether stats arrive from GitHub, and whether new users get in right now.",
    ogTitle: "questlog health",
    ogDescription: "Live health of the questlog card service.",
  },
  adminStatus: { title: "questlog health, every number" },
};

export const home = {
  hero: {
    title: "Pixel art cards for your GitHub profile",
    line: "Your stats, your top languages and your streak, drawn in one of 16 painted scenes. Add them to your README with one line: no token, no setup.",
    make: "Make my cards",
    wiki: "Read the wiki",
    alt: (user: string) => `${user}'s Character Sheet in the castle scene`,
  },
  bento: {
    title: "How it works",
    lede: "Your README links to an image. questlog draws it on its own server, so there is nothing to install or keep running.",
    scenesBig: "16",
    scenesTitle: "painted scenes",
    scenesText: "Forests, castles, cozy places and old halls. Every scene has all three cards.",
    setupTitle: "Nothing to set up",
    setupText: "GitHub loads a public image. No token, no workflow, no Action to schedule.",
    dayNightTitle: "Day and night",
    dayNightText: "Readers on a dark theme get the night painting, through a plain <code><picture></code> tag.",
    threeTitle: "Three cards",
    threeText: "A Character Sheet of your stats, a Spellbook of your top languages and a fire that grows with your streak.",
  },
  themes: {
    title: "Scenes",
    lede: "16 scenes in four themes, each painted by day and by night. Open one in the wiki to see all of its cards.",
    label: (theme: string) => `${theme} scenes`,
    thumbAlt: (card: string, scene: string) => `${card} in the ${scene} scene`,
  },
  stack: {
    title: "The three cards",
    lede: "Use one, or all three in the same scene.",
    stats: "Your level from lifetime contributions, with commits, PRs, stars, reviews and a class.",
    languages: "Your top five languages by code, each marked with its own rune.",
    streak: "Your current and best streak. Keep it going and the fire grows.",
    alt: (user: string, card: string) => `${user}'s ${card} in the forest scene`,
  },
  decorations: {
    title: "Decorations",
    lede: "Painted banners to head the sections of your README, or to divide them. Write any title you like, or none. Each one is painted by day and by night, and switches with the reader's theme like the cards.",
    alt: (label: string, title: string) => (title ? `The ${label} decoration titled ${title}` : `The ${label} decoration`),
    more: "Add one in the profile builder",
  },
  runes: {
    title: "Language runes",
    lede: "The Spellbook marks each of your top five languages with a rune in that language's color. There are 30 runes, and othala for every other language.",
  },
  gallery: {
    title: "Day and night",
    lede: "A light theme shows the day painting and a dark theme the night one. The numbers stay the same.",
    times: { day: "day", night: "night" },
    fires: { themed: "themed", classic: "classic" },
    alt: (user: string, card: string, scene: string, time: string) => `${user}'s ${card} in the ${scene} scene, ${time}`,
    fire: (fire: string) => `, ${fire} fire`,
  },
};

export const catalog = {
  themes: {
    forest: { name: "Forest", blurb: "Campfires under old trees, in summer green, autumn, mist and moonlight." },
    castle: { name: "Castle", blurb: "Braziers on the walls at sunset, under the aurora, in the sky and in the storm." },
    cozy: { name: "Cozy", blurb: "A fairy ring, a witch's hearth, a kingdom on the clouds and a rose garden." },
    scholarly: { name: "Scholarly", blurb: "A royal library, a war room, a guild hall and an observatory full of brass." },
  },
  /** Each scene's name, by its id. */
  scenes: {
    forest: "Forest",
    "forest-autumn": "Forest autumn",
    "forest-misty": "Forest misty",
    "forest-moonlit": "Forest moonlit",
    castle: "Castle",
    "castle-aurora": "Castle aurora",
    "castle-sky": "Castle sky",
    "castle-storm": "Castle storm",
    "fairy-garden": "Fairy garden",
    "witch-cottage": "Witch cottage",
    "cloud-kingdom": "Cloud kingdom",
    "rose-garden": "Rose garden",
    "royal-library": "Royal library",
    "war-room": "War room",
    "guild-hall": "Guild hall",
    observatory: "Observatory",
  },
  cards: { stats: "Character Sheet", languages: "Spellbook" },
  /** The streak card's name, by the fire its scene burns. */
  fires: { campfire: "Campfire", brazier: "Brazier", hearth: "Hearth", lantern: "Lantern", fireBowl: "Fire Bowl" },
  /** Each decoration's name, by its id. */
  decorations: {
    "reading-nook": "Reading nook",
    workbench: "Workbench",
    "raven-moon": "Raven and moon",
    "enchanted-clearing": "Enchanted clearing",
    "crystal-owl": "Crystal owl",
    "forest-divider": "Forest divider",
    "forest-footer": "Forest footer",
  },
  /** The rune for every language without its own. */
  otherLanguage: "Anything else",
  /** The All cards page's rows and groups. */
  combos: {
    looks: {
      dayFine: "Day, fine pixels",
      dayChunky: "Day, chunky pixels",
      nightFine: "Night, fine pixels",
      nightChunky: "Night, chunky pixels",
    },
    fires: {
      ashes: "ashes (no streak)",
      small: "small flame (1 to 6 days)",
      steady: "steady flame (7 to 29 days)",
      bonfire: "bonfire (30 days and more)",
    },
    messages: {
      placeholder: "first visit, stats on the way",
      quota: "waiting for GitHub's hourly limit",
      unknown: "no such GitHub user",
      busy: "too busy right now",
      failed: "GitHub could not be reached",
      error: "a mistake in the address",
    },
    top5: "Top 5 languages",
    top3: "Top 3 languages",
    fireRow: (themed: boolean, label: string) => `${themed ? "Themed" : "Classic"} fire, ${label}`,
    fireNote: "The fire grows with your streak. Classic is the same flame in every scene; themed takes the scene's own colors.",
    messagesTitle: "Messages",
    messagesNote: "What a card shows instead of the stats while they are on the way or when something is wrong.",
    messageRow: (card: string, label: string) => `${card}: ${label}`,
    decorationsTitle: "Decorations",
    decorationsNote: "Painted banners for the sections of a README. The title is yours to choose; these show the examples.",
  },
};

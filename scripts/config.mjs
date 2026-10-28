import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

// The whale's look. whale.config.json can override any of it under "mascot".
// Faces stay 9 characters wide so the body doesn't shift between moods.
const DEFAULT_MASCOT = {
  art: [
    "                {hat}",
    "             .-'''-.  _",
    "            {face}/ )      {caption}",
    "             '-...-'\\_/",
  ],
  moods: {
    idle: ["? ?", "( o  ‿  )", null],
    thinking: [". o O", "( -  ‿  )", "thinking..."],
    reading: ["[ ]", "( o  ‿  )", "reading the code..."],
    happy: ["~ ~", "( ^  ‿  )", "there you go."],
    sorry: [" ;", "( -  _  )", "can't help with that one."],
    broken: ["x x", "( x  ‿  )", "something broke."],
    sleepy: ["z z", "( -  ‿  )", "zzz... come back tomorrow."],
    confused: [" ?", "( o  .  )", "huh?"],
  },
  trick: [
    ["~", "( o  ‿  )"],
    ["~ ~", "( ^  ‿  )"],
    ["~ ~ ~", "( ^  ▽  )"],
    ["~ ~ ~ ~", "( ^  ▽  )"],
    ["~ ~", "( -  ‿  )"],
  ],
};

export async function loadConfig() {
  const raw = JSON.parse(await readFile(new URL("whale.config.json", root), "utf8"));
  for (const key of ["github", "name"]) {
    if (typeof raw[key] !== "string" || !raw[key].trim()) throw new Error(`whale.config.json: "${key}" is required`);
  }
  const name = raw.name.trim();
  const page = raw.page ?? {};
  const caption = page.caption ?? `ask me about ${name.toLowerCase()}'s work.`;
  const mascot = { ...DEFAULT_MASCOT, ...raw.mascot, moods: { ...DEFAULT_MASCOT.moods, ...raw.mascot?.moods } };
  mascot.moods.idle = [mascot.moods.idle[0], mascot.moods.idle[1], mascot.moods.idle[2] ?? caption];

  return {
    github: raw.github.trim(),
    name,
    contact: raw.contact ?? { label: "GitHub", url: `https://github.com/${raw.github.trim()}` },
    skipRepos: raw.skipRepos ?? [],
    notes: raw.notes ?? "knowledge/about.md",
    featured: raw.featured ?? [],
    page: {
      path: page.path ?? `~/${name.toLowerCase().replace(/\s+/g, "-")}`,
      caption,
      placeholder: page.placeholder ?? "ask me anything, or type /help",
      examples: page.examples ?? [`what does ${name.toLowerCase()} work on?`],
      badge: page.badge ?? "ask me anything about my work",
    },
    turnstileSiteKey: raw.turnstileSiteKey ?? "",
    mascot,
  };
}

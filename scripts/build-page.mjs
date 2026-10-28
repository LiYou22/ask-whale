import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";

const root = new URL("../", import.meta.url);
const config = await loadConfig();

const html = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fill = (template, vars) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key]);

const [hat, face, caption] = config.mascot.moods.idle;
const banner = [
  `<b>${html(config.page.path)}</b> <i>main</i>`,
  `<b>❯ ask-whale</b>`,
  ...config.mascot.art.map((line) =>
    html(line)
      .replace("{hat}", `<span id="hat">${html(hat)}</span>`)
      .replace("{face}", `<span id="face">${html(face)}</span>`)
      .replace("{caption}", `<span id="caption">${html(caption)}</span>`),
  ),
].join("\n");

// Only what the page needs. "<" is escaped so no value can close the <script> tag.
const pageConfig = JSON.stringify({
  github: config.github,
  name: config.name,
  featured: config.featured,
  turnstileSiteKey: config.turnstileSiteKey,
  moods: config.mascot.moods,
  trick: config.mascot.trick,
}).replace(/</g, "\\u003c");

if (!config.turnstileSiteKey) console.warn("whale.config.json: turnstileSiteKey is empty, the page can't get past verification");

await mkdir(new URL("public/", root), { recursive: true });
const template = await readFile(new URL("web/index.html", root), "utf8");
await writeFile(
  new URL("public/index.html", root),
  fill(template, {
    title: html(`ask-whale · ${config.name}`),
    description: html(`Ask the whale about ${config.name}'s work.`),
    banner,
    examples: config.page.examples.map((q) => `  <button type="button">${html(q)}</button>`).join("\n"),
    placeholder: html(config.page.placeholder),
    profileUrl: html(`https://github.com/${config.github}`),
    config: pageConfig,
  }),
);

// Profile badge, served at /badge-dark.svg and /badge-light.svg. Monospace at
// 12.5px is about 7.6px per character.
const THEMES = {
  dark: { bg: "#0d1117", border: "#3d444d", fg: "#f0f6fc", muted: "#9198a1", link: "#4493f8" },
  light: { bg: "#ffffff", border: "#d1d9e0", fg: "#1f2328", muted: "#59636e", link: "#0969da" },
};
const badge = await readFile(new URL("web/badge.svg", root), "utf8");
const width = Math.max(240, Math.ceil(22 + config.page.badge.length * 7.6 + 70));
for (const [theme, colors] of Object.entries(THEMES)) {
  await writeFile(
    new URL(`public/badge-${theme}.svg`, root),
    fill(badge, { ...colors, width, innerWidth: width - 1, askX: width - 10, text: html(config.page.badge) }),
  );
}

// What the Worker needs for its system prompt.
await writeFile(
  new URL("src/site.json", root),
  JSON.stringify({ github: config.github, name: config.name, contact: config.contact }),
);

console.log(`public/index.html, public/badge-{dark,light}.svg, src/site.json for ${config.name} (github.com/${config.github})`);

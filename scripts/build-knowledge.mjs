import { readFile, writeFile } from "node:fs/promises";

const USER = "LiYou22";
// The profile repo is ASCII art; about.md already covers it.
const SKIP = new Set([USER]);
const MAX_README_CHARS = 6000;

// Deliberately unauthenticated: without a token GitHub only ever returns public
// repos, so private ones can't leak into the prompt even by mistake.
const res = await fetch(`https://api.github.com/users/${USER}/repos?type=owner&per_page=100`, {
  headers: { "user-agent": "ask-whale-build" },
});
if (!res.ok) throw new Error(`repo list: HTTP ${res.status}`);
const repos = (await res.json()).filter((r) => !r.private && !r.fork && !SKIP.has(r.name));

const sections = await Promise.all(
  repos.map(async (r) => {
    const head = [`# repo: github.com/${USER}/${r.name}`, r.description, r.language && `language: ${r.language}`]
      .filter(Boolean)
      .join("\n");
    const readme = await fetch(`https://raw.githubusercontent.com/${USER}/${r.name}/${r.default_branch}/README.md`);
    if (!readme.ok) return head;
    const text = await readme.text();
    return `${head}\n\n${text.length > MAX_README_CHARS ? text.slice(0, MAX_README_CHARS) + "\n[readme truncated]" : text}`;
  }),
);

const about = await readFile(new URL("../knowledge/about.md", import.meta.url), "utf8");
const out = [about, ...sections].join("\n\n").replace(/<!--[\s\S]*?-->/g, "");
await writeFile(new URL("../src/knowledge.md", import.meta.url), out);
console.log(`src/knowledge.md: ${out.length} chars from about.md + ${repos.length} public repos: ${repos.map((r) => r.name).join(", ")}`);

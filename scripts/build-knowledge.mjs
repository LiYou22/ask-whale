import { readFile, writeFile } from "node:fs/promises";

// Keep in sync with the selected projects on the profile README.
const REPOS = ["kernel-agent", "raft-go", "earth", "Text-to-Medical-Images-Synthesis"];

const about = await readFile(new URL("../knowledge/about.md", import.meta.url), "utf8");
const readmes = await Promise.all(
  REPOS.map(async (repo) => {
    const res = await fetch(`https://raw.githubusercontent.com/LiYou22/${repo}/HEAD/README.md`);
    if (!res.ok) throw new Error(`${repo}: HTTP ${res.status}`);
    return `# repo: github.com/LiYou22/${repo}\n\n${await res.text()}`;
  }),
);

const out = [about, ...readmes].join("\n\n").replace(/<!--[\s\S]*?-->/g, "");
await writeFile(new URL("../src/knowledge.md", import.meta.url), out);
console.log(`src/knowledge.md: ${out.length} chars from about.md + ${REPOS.length} READMEs`);

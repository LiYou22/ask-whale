import { readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";

const config = await loadConfig();
const USER = config.github;
// The profile repo (<user>/<user>) is a README, not a project.
const SKIP = new Set([USER, ...config.skipRepos]);
const MAX_README_CHARS = 6000;
const MAX_FILE_BYTES = 200_000;
const MAX_FILES_PER_REPO = 1500;
const UNREADABLE = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|pt|pth|ckpt|safetensors|bin|npy|npz|pkl|h5|onnx|woff2?|ttf|mp4|mov)$/i;
const NOISE = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.venv)\/|(^|\/)(package-lock\.json|pnpm-lock\.yaml|uv\.lock|yarn\.lock)$/;

// /users/<user>/repos only ever lists public repos, and private ones are filtered
// again below, so private code can't reach the prompt. A token is optional and
// only raises the rate limit (60/hour anonymous); in GitHub Actions it's the
// workflow's own GITHUB_TOKEN.
const auth = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

async function gh(path, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { "user-agent": "ask-whale-build", accept, ...auth },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return accept.endsWith("sha") ? (await res.text()).trim() : res.json();
}

const repos = (await gh(`/users/${USER}/repos?type=owner&per_page=100`)).filter(
  (r) => !r.private && !r.fork && !SKIP.has(r.name),
);

const index = { user: USER, repos: {} };
const sections = await Promise.all(
  repos.map(async (r) => {
    // Pin to a commit so the file list and what read_file fetches always agree.
    const sha = await gh(`/repos/${USER}/${r.name}/commits/${r.default_branch}`, "application/vnd.github.sha");
    const tree = await gh(`/repos/${USER}/${r.name}/git/trees/${sha}?recursive=1`);
    if (tree.truncated) console.warn(`${r.name}: tree truncated by GitHub`);
    const files = tree.tree
      .filter((f) => f.type === "blob" && f.size <= MAX_FILE_BYTES && !UNREADABLE.test(f.path) && !NOISE.test(f.path))
      .slice(0, MAX_FILES_PER_REPO)
      .map((f) => ({ path: f.path, size: f.size }));
    index.repos[r.name] = { sha, files };

    const head = [`# repo: github.com/${USER}/${r.name}`, r.description, r.language && `language: ${r.language}`]
      .filter(Boolean)
      .join("\n");
    const readme = await fetch(`https://raw.githubusercontent.com/${USER}/${r.name}/${sha}/README.md`);
    if (!readme.ok) return head;
    const text = await readme.text();
    return `${head}\n\n${text.length > MAX_README_CHARS ? text.slice(0, MAX_README_CHARS) + "\n[readme truncated]" : text}`;
  }),
);

const about = await readFile(new URL(`../${config.notes}`, import.meta.url), "utf8");
const out = [about, ...sections].join("\n\n").replace(/<!--[\s\S]*?-->/g, "");
await writeFile(new URL("../src/knowledge.md", import.meta.url), out);
await writeFile(new URL("../src/repos.json", import.meta.url), JSON.stringify(index));

const fileCount = Object.values(index.repos).reduce((n, r) => n + r.files.length, 0);
console.log(`src/knowledge.md: ${out.length} chars from ${config.notes} + ${repos.length} public repos: ${repos.map((r) => r.name).join(", ")}`);
console.log(`src/repos.json: ${fileCount} readable files`);

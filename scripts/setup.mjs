// First-time setup: whale.config.json, Cloudflare login, Turnstile widget,
// secrets, deploy. Safe to re-run; finished steps are skipped.
// `pnpm run setup -- --dry-run` asks the questions but changes nothing.
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const DRY = process.argv.includes("--dry-run");
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CONFIG_PATH = new URL("../whale.config.json", import.meta.url);
const NOTES_PATH = new URL("../knowledge/about.md", import.meta.url);

const step = (n, text) => console.log(`\n\x1b[1m${n}. ${text}\x1b[0m`);
const done = (text) => console.log(`   \x1b[32m✓\x1b[0m ${text}`);
const note = (text) => console.log(`   ${text}`);

// One readline for the whole run; a second one would miss input that the first
// already buffered. Echo is switched off while an API key is typed.
// Lines are queued so piped answers (`printf ... | pnpm run setup`) aren't lost
// when they arrive before the question.
const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY });
const queued = [];
const waiting = [];
let closed = false;
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) stdout.write(s);
};
rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
rl.on("close", () => {
  closed = true;
  waiting.splice(0).forEach((resolve) => resolve(""));
});

function readLine(prompt) {
  rl.setPrompt(prompt);
  rl.prompt();
  if (queued.length) return Promise.resolve(queued.shift());
  if (closed) return Promise.resolve("");
  return new Promise((resolve) => waiting.push(resolve));
}

async function ask(question, fallback = "") {
  const answer = (await readLine(`   ${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  if (!stdin.isTTY) stdout.write("\n");
  return answer || fallback;
}

async function askSecret(question) {
  const answer = readLine(`   ${question}: `);
  muted = true;
  const value = (await answer).trim();
  muted = false;
  stdout.write("\n");
  return value;
}

function run(cmd, args, { input, inherit } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    stdio: inherit ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  if (res.error) throw res.error;
  return res;
}

const wrangler = (args, opts) => run("npx", ["wrangler", ...args], opts);
// Re-use whichever pnpm started this script; `npx pnpm@10` doesn't put pnpm on PATH.
const pnpm = (args, opts) =>
  process.env.npm_execpath ? run(process.execPath, [process.env.npm_execpath, ...args], opts) : run("pnpm", args, opts);

async function cloudflare(token, method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${method} ${path}: ${JSON.stringify(json.errors)}`);
  return json.result;
}

// 1. Who is the whale about?
step(1, "whale.config.json");
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const github = await ask("GitHub username", config.github);
const isNewOwner = github !== config.github;
const name = await ask("Your name, as the whale should say it", isNewOwner ? github : config.name);
const contactUrl = await ask(
  "Where visitors should reach you",
  isNewOwner ? `https://github.com/${github}` : config.contact?.url ?? `https://github.com/${github}`,
);
const contactLabel = await ask("…and what to call that link", isNewOwner ? "GitHub" : config.contact?.label ?? "GitHub");

Object.assign(config, { github, name, contact: { label: contactLabel, url: contactUrl } });
if (isNewOwner) {
  // Everything below belonged to the previous owner of this config.
  delete config.featured;
  delete config.page;
  config.skipRepos = [];
  config.turnstileSiteKey = "";
}
if (!DRY) await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
done(`whale.config.json is about ${name} (github.com/${github})`);

if (isNewOwner) {
  const notes = `<!-- Everything here goes into the model's context and can be quoted to any visitor. Only put public info here. HTML comments are stripped. -->\n\n# about ${name}\n\n- github: https://github.com/${github}\n- contact: ${contactUrl}\n`;
  if (!DRY) await writeFile(NOTES_PATH, notes);
  note("knowledge/about.md was reset. Add a few public lines about yourself there; the whale reads it.");
}

// 2. Cloudflare account.
step(2, "Cloudflare login");
let whoami = wrangler(["whoami", "--json"]);
if (whoami.status !== 0) {
  note("Opening the browser to log in to Cloudflare…");
  wrangler(["login"], { inherit: true });
  whoami = wrangler(["whoami", "--json"]);
  if (whoami.status !== 0) throw new Error("still not logged in to Cloudflare");
}
const accounts = JSON.parse(whoami.stdout).accounts ?? [];
if (accounts.length === 0) throw new Error("this Cloudflare login has no accounts");
let account = accounts[0];
if (accounts.length > 1) {
  accounts.forEach((a, i) => note(`${i + 1}) ${a.name}`));
  account = accounts[Number(await ask("Which account", "1")) - 1] ?? accounts[0];
}
done(`account: ${account.name}`);

const tokenOut = wrangler(["auth", "token"]).stdout.split("\n").map((l) => l.trim());
const token = tokenOut.filter((l) => /^[\w.-]{20,}$/.test(l)).pop();
if (!token) throw new Error("could not read the Cloudflare token from `wrangler auth token`");

const workerName = (await readFile(new URL("../wrangler.toml", import.meta.url), "utf8")).match(/^name\s*=\s*"([^"]+)"/m)[1];
let subdomain;
try {
  subdomain = (await cloudflare(token, "GET", `/accounts/${account.id}/workers/subdomain`)).subdomain;
} catch {
  throw new Error("this account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard once, then re-run setup.");
}
const host = `${workerName}.${subdomain}.workers.dev`;
done(`the whale will live at https://${host}`);

// 3. Turnstile, the bot check in front of every question.
step(3, "Turnstile");
let turnstileSecret = null;
if (config.turnstileSiteKey) {
  done("already configured (turnstileSiteKey is set). Clear it in whale.config.json to create a new widget.");
} else if (DRY) {
  note(`would create a managed widget for ${host} and localhost`);
} else {
  const widget = await cloudflare(token, "POST", `/accounts/${account.id}/challenges/widgets`, {
    name: workerName,
    domains: [host, "localhost"],
    mode: "managed",
  });
  config.turnstileSiteKey = widget.sitekey;
  turnstileSecret = widget.secret;
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  done(`created a widget for ${host}; its site key is now in whale.config.json`);
}

// 4. Claude API key.
step(4, "Claude API key");
const existing = wrangler(["secret", "list", "--format", "json"]);
const haveKey = existing.status === 0 && JSON.parse(existing.stdout || "[]").some((s) => s.name === "ANTHROPIC_API_KEY");
note("From console.anthropic.com → API keys. It is sent straight to Cloudflare as a Worker secret.");
note("Set a monthly spend limit on that Console organization too; it is the hard cap on cost.");
const apiKey = await askSecret(haveKey ? "API key (Enter to keep the current one)" : "API key");
if (!apiKey && !haveKey) throw new Error("an API key is required");

// 5. Deploy, then set secrets (the Worker has to exist first).
step(5, "Deploy");
if (DRY) {
  const toSet = [apiKey && "ANTHROPIC_API_KEY", (turnstileSecret || !config.turnstileSiteKey) && "TURNSTILE_SECRET"].filter(Boolean);
  note(`would run \`pnpm run deploy\`${toSet.length ? `, then set ${toSet.join(" and ")}` : ""}`);
} else {
  if (pnpm(["run", "deploy"], { inherit: true }).status !== 0) throw new Error("deploy failed");
  const secrets = { ...(apiKey && { ANTHROPIC_API_KEY: apiKey }), ...(turnstileSecret && { TURNSTILE_SECRET: turnstileSecret }) };
  for (const [secretName, value] of Object.entries(secrets)) {
    const res = wrangler(["secret", "put", secretName], { input: value });
    if (res.status !== 0) throw new Error(`setting ${secretName} failed:\n${res.stderr}`);
    done(`${secretName} set`);
  }
}

step(6, "Done");
console.log(`
   Your whale: https://${host}

   Put it on your profile README:

   <a href="https://${host}"><picture><source media="(prefers-color-scheme: dark)" srcset="https://${host}/badge-dark.svg"><img alt="ask me anything about my work" src="https://${host}/badge-light.svg" height="22"></picture></a>

   Keep it fresh: the knowledge is a snapshot from this deploy. See "Auto-refresh" in the README
   to redeploy daily from GitHub Actions.
`);
if (DRY) note("(dry run: nothing was changed)");
rl.close();

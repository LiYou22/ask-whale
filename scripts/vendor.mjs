import { copyFile, mkdir } from "node:fs/promises";

// Served from our own origin instead of a CDN, so the page runs no third-party
// script besides Turnstile.
const FILES = {
  "node_modules/marked/lib/marked.umd.js": "public/vendor/marked.js",
  "node_modules/dompurify/dist/purify.min.js": "public/vendor/purify.js",
};

const root = new URL("../", import.meta.url);
await mkdir(new URL("public/vendor/", root), { recursive: true });
for (const [from, to] of Object.entries(FILES)) await copyFile(new URL(from, root), new URL(to, root));
console.log(`vendored ${Object.values(FILES).join(", ")}`);

# ask-whale

Chat page for the whale on my GitHub profile. One Cloudflare Worker serves `public/` and `POST /api/chat`, which streams answers from Claude using the notes in `knowledge/about.md` plus the READMEs of my selected projects.

## setup

```sh
npx pnpm@10 install
pnpm wrangler login
pnpm wrangler kv namespace create RATE      # paste the id into wrangler.toml
pnpm wrangler secret put ANTHROPIC_API_KEY  # key from the Console org linked to the Max credit
pnpm run deploy
```

Local dev: put `ANTHROPIC_API_KEY=...` in `.dev.vars`, then `pnpm dev`.

## knobs

`wrangler.toml` `[vars]`: `MODEL`, `PER_IP_DAILY`, `GLOBAL_DAILY`. `pnpm knowledge` rebuilds `src/knowledge.md` and runs automatically before `dev` and `deploy`.

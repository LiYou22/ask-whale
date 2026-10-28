# ask-whale

```
    ? ?
 .-'''-.  _
( o  ‿  )/ )    hi, i'm the whale from github.com/LiYou22.
 '-...-'\_/     ask me about you li's projects.
```

**try it:** https://ask-whale.ask-whale.workers.dev

## what is this

a tiny chat page that answers questions about my work. you type a question, claude reads my public repos' readmes, and the whale answers in a few sentences. it only talks about my projects. ask it for a quicksort and it will politely swim away.

## how it works

```
browser ──▶ cloudflare worker ──▶ claude (sonnet 5.5)
   ▲              │
   └── streamed ──┘
       answer
```

- **one worker does everything.** it serves `public/index.html` and handles `POST /api/chat`.
- **what the whale knows** = `knowledge/about.md` + the readme of every public, non-fork repo i own. it's fetched at deploy time, so new repos show up after the next deploy.
- **private repos can't leak.** the fetch uses the github api *without* a token, and github only ever shows public repos to anonymous requests.

## keeping the whale from getting farmed

it's a public page that spends real api credits, so:

- **turnstile:** cloudflare's invisible bot check. no token, no answer.
- **rate limits:** 20 questions per person per day (ipv6 counted per /64), 300 for everyone combined.
- **signed history:** every answer comes back with an hmac signature. edit an old answer to sneak in "ignore your rules" and the worker says no.
- **spend cap:** the real backstop is the monthly limit on the anthropic console.

## run your own

```sh
npx pnpm@10 install
pnpm wrangler login
pnpm wrangler kv namespace create RATE      # paste the id into wrangler.toml
pnpm wrangler secret put ANTHROPIC_API_KEY
pnpm wrangler secret put TURNSTILE_SECRET   # from a turnstile widget in the cloudflare dashboard
openssl rand -base64 32 | tr -d '\n' | pnpm wrangler secret put HISTORY_KEY
pnpm run deploy
```

then put your turnstile site key in `public/index.html` and change `USER` in `scripts/build-knowledge.mjs`.

local dev: put the three secrets in `.dev.vars` (cloudflare has [turnstile test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) that always pass), then `pnpm dev`.

## knobs

| where | what |
|---|---|
| `wrangler.toml` `[vars]` | `MODEL`, `PER_IP_DAILY`, `GLOBAL_DAILY` |
| `src/index.ts` `SYSTEM` | what the whale will and won't talk about |
| `knowledge/about.md` | extra notes. anything here can be quoted to any visitor, so keep it public |

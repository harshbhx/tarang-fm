# Maintaining Tarang FM

Notes for the maintainer. The code is source-available and all rights reserved (see [LICENSE](../LICENSE)); these steps are not an invitation to deploy a copy.

## Local development

Needs Node 22 (`.nvmrc`) and a Sarvam API key from [dashboard.sarvam.ai](https://dashboard.sarvam.ai).

```bash
npm ci
cp .dev.vars.example .dev.vars   # add SARVAM_API_KEY
npm run dev                      # http://localhost:5173
```

| Variable | Needed for |
|---|---|
| `SARVAM_API_KEY` | Everything that speaks, listens or writes |
| `LIVE_ADMIN_TOKEN` | Studio controls on `/live?admin=<key>` and the newsroom admin routes |
| `PHONE_WEBHOOK_TOKEN` | The studio phone line's call-end webhook |
| `PRODUCER_JUDGE`, `PRODUCER_MODEL` | Optional producer-judge switches |

Debug views without any credits: `/?preview=ui` and `/?preview=live`.

## Deploy

Pushes to `main` deploy through `.github/workflows/ci-cd.yml` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`). By hand:

```bash
npx wrangler secret put SARVAM_API_KEY
npm run deploy
```

Bindings (KV, Durable Objects, D1, Vectorize, Workers AI, Workflow, rate limiters) are declared in `wrangler.jsonc`; the D1 schema is in `migrations/`.

## README media

The README loops in `docs/media/` come from the `README media` workflow (`scripts/record-readme-media.mjs`). Run it from the Actions tab; only its `tune-in` clip uses real Sarvam credits.

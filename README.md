# Manchester Roleplay

Private source repository for the Manchester Roleplay community platform.

## Current source import

The following production Cloudflare Worker entrypoints were copied into this repository as a source snapshot:

- `bot/index.js` — Discord bot and Gateway worker
- `website/index.js` — public website and staff dashboard
- `data/index.js` — shared application API and data service
- `map-data/index.js` — CAD live-map data and location indexing

## Important migration status

This is a source backup/import, **not yet a Render-ready deployment**. The code currently uses Cloudflare Workers APIs and bindings (including Durable Objects and D1). Each service must be adapted to a compatible runtime and its storage/queue needs before deploying to Render.

Keep the existing Cloudflare services running until the Render replacements have been migrated, configured, and tested. Do not put API keys, Discord bot tokens, OAuth secrets, or other credentials in this repository; configure them as environment secrets in the eventual hosting platform.

## Scope

Only the four Manchester Roleplay Workers listed above are included. Legacy TSRP/Government projects and Workers are intentionally excluded.

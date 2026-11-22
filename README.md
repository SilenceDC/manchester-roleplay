# Texas State Roleplay

Private source repository for the Texas State Roleplay ER:LC community platform.

## Production services

| Repository path | Cloudflare Worker | Responsibility |
| --- | --- | --- |
| `bot/index.js` | `manchester-roleplay-bot` | Discord bot, slash commands, Gateway automod and moderation |
| `website/index.js` | `manchester-roleplay-site` | Public website, Discord staff sign-in, moderation dashboard and CAD |
| `data/index.js` | `manchester-roleplay-data` | Shared API and Turso-backed application records |
| `map-data/index.js` | `manchester-roleplay-map-data` | Live CAD map proxy, coordinate transforms and map location index |

## Checks and deployment

- `npm run check` validates JavaScript syntax and runs the regression suite.
- GitHub Actions runs checks for pushes and pull requests.
- Production deployment is manual through **Deploy to Cloudflare** in GitHub Actions.
- The deployment workflow uploads Worker source only. It deliberately does not change Cloudflare bindings, secrets, D1 database IDs, Durable Object namespaces, compatibility dates, routes, or Cron Triggers.

To enable GitHub-initiated production releases, add a repository Actions secret named `CLOUDFLARE_API_TOKEN` with the Cloudflare account permission **Workers Scripts Write**. The account ID is already recorded in the workflow. Choose the Worker to deploy and run the workflow manually from `main`; the CI test job must pass first.

The Discord and ER:LC application credentials are stored as GitHub repository secrets and separately as Cloudflare Worker secrets where the running services need them. Never commit secret values or paste them into source files.

## Runtime configuration

Cloudflare is the production runtime. Existing Worker bindings and persistent resources are maintained in Cloudflare and must be preserved when deploying code. The bot uses a Durable Object for the Discord Gateway; the data and map services use separate D1 databases.

## Project boundaries

Only the four Texas State Roleplay Workers listed above are included. Legacy TSRP/Government projects and Workers are intentionally excluded and must not be changed as part of this project.

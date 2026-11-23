# Texas State Roleplay

Private source repository for the Texas State Roleplay ER:LC community platform.

## Production services

| Repository path | Cloudflare Worker | Responsibility |
| --- | --- | --- |
| `bot/index.js` | `manchester-roleplay-bot` | Discord bot, slash commands, Gateway automod and moderation |
| `website/index.js` | `manchester-roleplay-site` | Public website, Discord staff sign-in, moderation dashboard and CAD |
| `data/index.js` | `manchester-roleplay-data` | Shared API and Turso-backed application records |
| `map-data/index.js` | `manchester-roleplay-map-data` | Live CAD map proxy, coordinate transforms and map location index |

The four deployed Cloudflare script IDs shown above are being retained temporarily so existing service bindings, secrets, OAuth configuration, and the Discord Gateway Durable Object keep working. The source and public-facing branding are now Texas State Roleplay; the `workers.dev` script hostnames are not yet renamed.

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

## Discord workflow features

The bot uses the existing Turso-backed `app_state` records for ticket/Fast Pass numbering and workflow state.

- `/server start-up`, `/server shutdown`, and `/server low-on-players` post restricted session embeds. `/server invite` returns the configured invite.
- `/ticket-panel` posts General, Ownership, and Internal Affairs ticket buttons to channel `1574355318560002118`. Private ticket channels are created under category `1574355361627111506`; transcripts are uploaded to `1574357055840587886` before a ticket channel is removed. Ping Staff is limited by a five-minute per-ticket cooldown.
- `/fastpass-panel` posts the Fast Pass application button to `1574357769266528306`. Applicants submit their previous roles, file proof, and a Discord invite; reviews appear in `1574357807484899418`.
- `/staff-record` has `promotion`, `infraction`, `warning`, and `strike` subcommands for the corresponding staff-record channels.
- On `/server shutdown`, the bot requests ER:LC v2 CommandLogs, ModCalls, JoinLogs, and KillLogs and exports website moderation records into a JSON archive in `1574355077861351454`. It clears the matching Turso moderation rows only after Discord confirms the archive upload; on upload failure the stored logs remain untouched.

The session announcement and shutdown archive channel is `1574355077861351454`. Session commands post Discord announcements; they do not power the ER:LC server on or off.

Post the ticket and Fast Pass panels once after deploying by running `/ticket-panel` and `/fastpass-panel` as Admin, Internal Affairs, or Ownership. The bot needs View Channel, Send Messages, Embed Links, Attach Files, Read Message History, Manage Channels, and permission to create private channel overwrites for the configured support roles.

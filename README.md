# Signal Relay

Signal Relay is a Telegram channel monitoring and publishing dashboard. It reads new posts from configured Telegram channels using a Telegram user account (MTProto), removes promotional content, optionally applies an “uwu” text transformation, preserves photos and videos, and publishes eligible posts to a destination channel using a Telegram bot.

The project contains a React dashboard and an Express API in a pnpm monorepo. The dashboard and API must run in separate terminals during local development.

## Requirements

- Node.js 24
- pnpm
- A Telegram account that can access the source channels (needed for live reading)
- A Telegram bot with permission to publish in the destination channel (needed for live publishing)

PostgreSQL is not required for the current local demo: the API currently initializes sample sources, posts, and rules in memory. Changes to that state are lost when the API restarts.

## Install

From the project root:

```sh
pnpm install
```

The repository enforces pnpm during installation; use it rather than npm or Yarn.

## Configure Telegram (optional)

The dashboard can be explored without Telegram credentials, but live reading and publishing require server-side credentials. Create a `.env` file in the project root:

```dotenv
PORT=5000
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_PHONE_NUMBER=
TELEGRAM_BOT_TOKEN=
```

Get `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org/). Use the phone number of the Telegram user account that can access the sources, including its country code. Create the bot with [@BotFather](https://t.me/BotFather) and set its token as `TELEGRAM_BOT_TOKEN`.

The configured destination is currently `@comnyews`; grant the bot permission to publish there. The user account, not the bot, reads source channels. Complete the account login from the dashboard’s **Connection** page using the Telegram verification code and, if requested, the account’s two-factor authentication password.

The MTProto session is saved in `signal-relay-user-session/`. Keep this directory and all credentials private; `.env` and the session directory are git-ignored. Do not commit or share them. If Telegram credentials are omitted, the API still starts but the reader remains unconfigured.

## Run locally

Open two PowerShell terminals at the project root.

**Terminal 1 — API server:**

```powershell
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

The API reads `PORT` from the root `.env`; it defaults to no port, so ensure `PORT=5000` is set before starting. Alternatively, set it for the current PowerShell terminal:

```powershell
$env:PORT = "5000"
pnpm --filter @workspace/api-server run start
```

**Terminal 2 — dashboard:**

```powershell
$env:PORT = "5173"
$env:API_PORT = "5000"
pnpm --filter @workspace/telegram-news-aggregator run dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development server proxies `/api` requests to the API at port 5000. Keep both terminals running. To use different ports, set the API’s `PORT` and the dashboard’s `API_PORT` to the same API port.

## Useful commands

| Command | Purpose |
| --- | --- |
| `pnpm run typecheck` | Type-check the workspace |
| `pnpm run build` | Type-check and build workspace packages |
| `pnpm --filter @workspace/api-server run build` | Build the API server |
| `pnpm --filter @workspace/api-server run start` | Start the built API server |
| `pnpm --filter @workspace/telegram-news-aggregator run build` | Build the dashboard |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API client and validation types from the OpenAPI spec |

## API and behavior

- API health check: `GET http://localhost:5000/api/healthz`
- API root: `GET http://localhost:5000/`
- Telegram login/status endpoints: `/api/mtproto/status`, `/api/mtproto/request-code`, and `/api/mtproto/verify`
- The relay listens for new incoming posts after the Telegram user account is connected; it does not backfill old posts.
- Sources, rules, and post activity are currently held in memory and reset when the API restarts.
- The relay reads source handles configured in the API source registry. Use the dashboard to manage them.

## Database

The repository includes a PostgreSQL/Drizzle workspace package (`lib/db`), but the current API demo uses in-memory seed data and does not require a database. Database schema commands do require a valid `DATABASE_URL`:

```sh
pnpm --filter @workspace/db run push
```

Do not run database commands against a production database unless you intend to apply schema changes.

## Project layout

- `artifacts/api-server/` — Express API and Telegram relay
- `artifacts/telegram-news-aggregator/` — React dashboard
- `lib/api-spec/` — OpenAPI contract
- `lib/api-client-react/` and `lib/api-zod/` — generated API client and schemas
- `lib/db/` — PostgreSQL/Drizzle schema and tooling

## Troubleshooting

- **API exits with a missing `PORT` error:** add `PORT=5000` to the root `.env` or set `$env:PORT = "5000"` in its terminal.
- **Dashboard cannot reach the API:** confirm both servers are running and the dashboard’s `API_PORT` matches the API’s `PORT`.
- **Connection page says credentials are missing:** check that the Telegram variables are in the root `.env`; restart the API after changing them.
- **No posts are relayed:** confirm the reader account is logged in and can access the configured source channels, and that the bot can publish in `@comnyews`.
- **Telegram session problems:** stop the API before changing or removing the local session directory; logging in again may be required.

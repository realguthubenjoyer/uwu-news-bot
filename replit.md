# Signal Relay

Signal Relay curates Telegram channel updates into one destination feed, preserving media, adding source attribution, translating text in uwu mode, and filtering promotional posts.

## Run & Operate

- API port: `5000`
- Dashboard port: `5173`
- `pnpm --filter @workspace/api-server run build` then `pnpm --filter @workspace/api-server run start` — run the API (`PORT=5000`)
- `pnpm --filter @workspace/api-server run dev` — Replit/Linux helper that sets `NODE_ENV=development`, builds, and starts
- `pnpm --filter @workspace/telegram-news-aggregator run dev` — dashboard (`PORT=5173`, `BASE_PATH=/`, `API_PORT=5000`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (for DB-backed packages)
- Telegram reader env (server-side only): `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_PHONE_NUMBER`
- Telegram publisher env (server-side only): `TELEGRAM_BOT_TOKEN`
- Health: `GET /api/healthz`
- MTProto login: `GET /api/mtproto/status`, `POST /api/mtproto/request-code`, `POST /api/mtproto/verify`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (ESM bundle)
- Telegram reader: teleproto 1.229.0 (MTProto user account)

## Where things live

- `artifacts/telegram-news-aggregator/` — React dashboard for control room, sources, rules, and Telegram connection/login state.
- `artifacts/api-server/src/routes/relay.ts` — relay API, 29-channel source registry, and MTProto login/sync endpoints.
- `artifacts/api-server/src/lib/telegram-user-relay.ts` — MTProto user-account reader, StoreSession, media download, and Bot API republish.
- `artifacts/api-server/src/lib/telegram-relay.ts` — shared filtering, uwu transformation, source labels, and legacy Bot API helpers.
- `lib/api-spec/openapi.yaml` — source of truth for relay endpoint contracts.

## Architecture decisions

- Source channels are read by a Telegram **user account** over MTProto. The bot is not added as administrator to the 29 source channels.
- The existing bot only publishes to `@comnyews` (Com News in UwU), where it already has administrator publishing rights.
- Incoming photos and videos are downloaded through MTProto and uploaded to the Bot API (`sendPhoto` / `sendVideo`). Text uses `sendMessage`.
- Login uses a verification code and optional 2FA password through `/api/mtproto/*` and the Connection page. Session files live in `signal-relay-user-session/` and are gitignored.
- Missing Telegram API credentials report `missing_credentials` and do not crash the API.
- Credentials, session strings, and passwords stay on the server and are never shown in the dashboard or logs.
- The first build uses seeded in-memory relay state so the control room can be previewed before database persistence is added.

## Product

The dashboard lets an operator review relay activity, manage grouped source channels, configure uwu translation and media/source-label behavior, maintain blocked keywords, inspect blocked promotional posts, and complete MTProto user-account login.

## User preferences

- Preserve source attribution on every published post.
- Keep useful news posts even when they contain appended promotions; remove the promotional blocks before delivery. Suppress only standalone ad-only messages.
- Read only the explicitly configured source handles in the source registry, preserve incoming photos and videos, leave the source handle outside uwu transformation, remove promotional quote blocks from mixed posts, and never publish posts marked `[PAID AD]`.

## Gotchas

- The MTProto reader must be logged in with a user account that can already see the configured source channels.
- The bot still needs publishing rights in `@comnyews`. It does **not** need to be an administrator of source channels.
- Add Telegram secrets through Replit Secrets (or local env); never paste them into chat or commit them.
- `signal-relay-user-session/` must stay uncommitted.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

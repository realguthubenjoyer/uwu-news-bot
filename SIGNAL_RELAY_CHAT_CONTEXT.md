# Signal Relay — Chat Context

This is a project/chat context summary, not a verbatim transcript. The raw conversation is not stored as a workspace file.

## Goal
Switch the Telegram reader from Bot API polling to a Telegram user-account client via MTProto so configured source channels can be read without adding the bot as administrator to every source channel. Keep the bot for publishing to `@comnyews` where practical.

## Source registry
The registry contains 29 channels in exactly these groups: Telegram/Com, Crypto Scams/Exploits/Com, and OGU News. Removed sources included `@Vxunderground`, `@Beware`, `@DWCupdate`, `@Dont_get_scammed_news`, all Crypto entries, all Gift News entries, and all General entries.

## Relay rules
Preserve source attribution and photos/videos; apply uwu text transformation while leaving the source handle unchanged; remove promotional quote blocks from mixed posts; suppress standalone advertisements; never publish posts containing `[PAID AD]`; destination is `@comnyews`.

## Implementation status at export time
The MTProto reader is in `artifacts/api-server/src/lib/telegram-user-relay.ts`. API startup uses it, while the existing Bot API relay remains as legacy/shared code. Login endpoints are `/api/mtproto/status`, `/api/mtproto/request-code`, and `/api/mtproto/verify`. Teleproto is declared at version `1.229.0`. Final TypeScript cleanup and lockfile verification were pending when this export was requested.

## Safety
No Telegram credentials, session files, caches, generated temporary files, or git history are included. Configure credentials through Replit Secrets after importing.

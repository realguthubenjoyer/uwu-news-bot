---
name: Telegram relay access
description: Permission boundaries for the Telegram aggregation pipeline.
---

Telegram Bot API updates are not a general public-channel firehose. The bot must be added with read access to each source channel and publishing rights in the destination channel; without the bot token, the relay should remain visibly paused rather than pretending to sync.

**Why:** Public usernames alone do not grant a bot permission to receive channel posts or publish into another channel.

**How to apply:** Keep connection state, sync controls, and setup guidance explicit whenever the Telegram secret or channel permissions are missing.

The long-polling listener and a manual sync request must share a single in-flight lock; Telegram rejects concurrent `getUpdates` calls with a conflict.

**Why:** The dashboard sync action can overlap the always-on listener even when only one server instance is running.

**How to apply:** Treat manual sync as a guarded poll or report that the continuous listener is already active rather than opening a second polling request.
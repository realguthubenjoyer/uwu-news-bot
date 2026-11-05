import { Api, TelegramClient } from "teleproto";
import { computeCheck } from "teleproto/Password";
import { StoreSession } from "teleproto/sessions";
import { NewMessage, type NewMessageEvent } from "teleproto/events";
import { logger } from "./logger";
import {
  cleanPromotionalContent,
  hasGiveawaySignal,
  hasPaidAdMarker,
  isDuplicateStoryPost,
  uwuify,
  type RelayPost,
  type RelayState,
  type TelegramMessageEntity,
} from "./telegram-relay";

type LoginState =
  | "missing_credentials"
  | "needs_login"
  | "code_required"
  | "password_required"
  | "connected"
  | "error";

type UserRelayStatus = {
  ok: boolean;
  username: string | null;
  detail: string;
  loginState: LoginState;
  mode: "mtproto_user";
};

function readerSecrets() {
  return {
    apiId: Number(process.env.TELEGRAM_API_ID ?? ""),
    apiHash: process.env.TELEGRAM_API_HASH ?? "",
    phoneNumber: (process.env.TELEGRAM_PHONE_NUMBER ?? "").replace(/\s/g, ""),
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  };
}

let client: TelegramClient<StoreSession> | null = null;
let loginBusy = false;
let loginState: LoginState = "needs_login";
let lastError: string | null = null;
let handlersInstalled = false;
let phoneCodeHash = "";
let codeViaApp = false;

function credentialsAvailable(): boolean {
  const { apiId, apiHash, phoneNumber } = readerSecrets();
  return Number.isInteger(apiId) && apiId > 0 && Boolean(apiHash) && Boolean(phoneNumber);
}

function rpcErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "errorMessage" in error) {
    return String((error as { errorMessage: string }).errorMessage);
  }
  return error instanceof Error ? error.message : "Telegram login failed";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getClient(): TelegramClient<StoreSession> {
  const { apiId, apiHash } = readerSecrets();
  if (!credentialsAvailable()) {
    throw new Error(
      "TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE_NUMBER are required.",
    );
  }
  if (!client) {
    client = new TelegramClient(
      new StoreSession("signal-relay-user-session"),
      apiId,
      apiHash,
      { connectionRetries: 5, timeout: 20 },
    );
  }
  return client;
}

async function resetClient(): Promise<void> {
  if (!client) return;
  try {
    await client.disconnect();
  } catch {
    // Ignore disconnect failures while recovering a stuck login.
  }
  client = null;
  handlersInstalled = false;
  phoneCodeHash = "";
}

async function ensureConnected(): Promise<TelegramClient<StoreSession>> {
  const telegramClient = getClient();
  if (!telegramClient.connected) {
    await withTimeout(telegramClient.connect(), 25000, "Telegram connect timed out");
  }
  return telegramClient;
}

function trimPosts(state: RelayState): void {
  state.posts.splice(40);
}

function recordPost(state: RelayState, post: RelayPost): void {
  state.posts.unshift(post);
  trimPosts(state);
}

type MediaShape = {
  className?: string;
  document?: { attributes?: Array<{ className?: string }> };
};

function asMediaShape(value: unknown): MediaShape | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as MediaShape;
}

function mediaTypeFor(message: { media?: unknown }): "image" | "video" | "none" {
  const media = asMediaShape(message.media);
  if (!media) return "none";
  if (media.className === "MessageMediaPhoto") return "image";
  if (
    media.className === "MessageMediaDocument" &&
    media.document?.attributes?.some((attribute) =>
      attribute.className?.toLowerCase().includes("video"),
    )
  ) {
    return "video";
  }
  return "none";
}

function blobFromBuffer(media: Buffer): Blob {
  const bytes = new Uint8Array(media.byteLength);
  bytes.set(media);
  return new Blob([bytes]);
}

function mapEntities(
  entities: Array<{ className?: string; offset?: number; length?: number }> | undefined,
): TelegramMessageEntity[] {
  return (entities ?? []).map((entity) => ({
    type: entity.className?.toLowerCase().includes("blockquote")
      ? "blockquote"
      : "other",
    offset: Number(entity.offset ?? 0),
    length: Number(entity.length ?? 0),
  }));
}

async function publishWithBot(
  destination: string,
  caption: string,
  media: Buffer | undefined,
  mediaType: "image" | "video" | "none",
): Promise<void> {
  const { botToken } = readerSecrets();
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required for publishing.");
  }

  const method =
    mediaType === "image"
      ? "sendPhoto"
      : mediaType === "video"
        ? "sendVideo"
        : "sendMessage";

  if (!media) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: destination,
        text: caption,
        disable_web_page_preview: false,
      }),
    });
    const result = (await response.json()) as { ok?: boolean; description?: string };
    if (!result.ok) throw new Error(result.description ?? "Telegram publish failed");
    return;
  }

  const form = new FormData();
  form.set("chat_id", destination);
  form.set("caption", caption);
  form.set(
    mediaType === "image" ? "photo" : "video",
    blobFromBuffer(media),
    mediaType === "image" ? "relay.jpg" : "relay.mp4",
  );
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: form,
  });
  const result = (await response.json()) as { ok?: boolean; description?: string };
  if (!result.ok) throw new Error(result.description ?? "Telegram media publish failed");
}

async function handleIncomingMessage(
  event: NewMessageEvent,
  state: RelayState,
): Promise<void> {
  const telegramClient = getClient();
  const message = event.message;
  if (event.chatId === undefined) return;
  const chat = await telegramClient.getEntity(event.chatId);
  const username =
    typeof chat === "object" && chat && "username" in chat
      ? String((chat as { username?: string }).username ?? "")
      : "";
  if (!username) return;

  const handle = `@${username}`;
  const source = state.sources.find(
    (item) => item.enabled && item.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!source) return;

  const originalText = String(message.message ?? "");
  const mediaType = mediaTypeFor(message);

  if (isDuplicateStoryPost(originalText, state.posts)) {
    recordPost(state, {
      id: state.nextPostId++,
      sourceHandle: source.handle,
      sourceName: source.name,
      group: source.group,
      headline: "Duplicate story removed",
      body: originalText,
      status: "blocked",
      mediaType,
      mediaUrl: null,
      receivedAt: "just now",
      translated: false,
      reason: "Duplicate story suppressed",
    });
    return;
  }

  if (hasPaidAdMarker(originalText)) {
    recordPost(state, {
      id: state.nextPostId++,
      sourceHandle: source.handle,
      sourceName: source.name,
      group: source.group,
      headline: "Paid advertisement",
      body: originalText,
      status: "blocked",
      mediaType,
      mediaUrl: null,
      receivedAt: "just now",
      translated: false,
      reason: "[PAID AD] marker detected",
    });
    return;
  }

  if (hasGiveawaySignal(originalText)) {
    recordPost(state, {
      id: state.nextPostId++,
      sourceHandle: source.handle,
      sourceName: source.name,
      group: source.group,
      headline: "Giveaway or reward post",
      body: originalText,
      status: "blocked",
      mediaType,
      mediaUrl: null,
      receivedAt: "just now",
      translated: false,
      reason: "Giveaway or reward content removed",
    });
    return;
  }

  const moderation = state.rules.blockAds
    ? cleanPromotionalContent(
        originalText,
        mapEntities(message.entities as Array<{ className?: string; offset?: number; length?: number }>),
        state.rules.blockedKeywords,
      )
    : { cleaned: originalText.trim(), removed: false };

  if (!moderation.cleaned) {
    recordPost(state, {
      id: state.nextPostId++,
      sourceHandle: source.handle,
      sourceName: source.name,
      group: source.group,
      headline: "Standalone promotional message",
      body: originalText,
      status: "blocked",
      mediaType,
      mediaUrl: null,
      receivedAt: "just now",
      translated: false,
      reason: "Standalone ad removed",
    });
    return;
  }

  const post: RelayPost = {
    id: state.nextPostId++,
    sourceHandle: source.handle,
    sourceName: source.name,
    group: source.group,
    headline:
      moderation.cleaned.split(/\r?\n/).find((line) => line.trim())?.trim() ??
      "Untitled update",
    body: moderation.cleaned,
    status: "queued",
    mediaType,
    mediaUrl: null,
    receivedAt: "just now",
    translated: false,
    reason: moderation.removed ? "Ad removed from the end of the post" : null,
  };

  const translatedText = state.rules.translate
    ? uwuify(moderation.cleaned)
    : moderation.cleaned;
  const caption = `${state.rules.addSourceLabel ? `Sources: ${source.handle}\n\n` : ""}${translatedText}`.trim();
  let media: Buffer | undefined;
  if (mediaType !== "none") {
    const downloaded = await telegramClient.downloadMedia(message, {});
    if (Buffer.isBuffer(downloaded)) media = downloaded;
  }

  try {
    await publishWithBot(state.rules.deliveryChannel, caption, media, mediaType);
    post.status = "published";
    post.body = translatedText;
    post.translated = state.rules.translate;
  } catch (error) {
    logger.warn({ err: error, source: source.handle }, "MTProto relay publish failed");
    post.reason = "Queued because publishing failed";
  }
  recordPost(state, post);
}

async function installHandlers(state: RelayState): Promise<void> {
  if (handlersInstalled) return;
  const telegramClient = getClient();
  telegramClient.addEventHandler(
    (event: NewMessageEvent) => {
      void handleIncomingMessage(event, state).catch((error) => {
        logger.warn({ err: error }, "MTProto source message processing failed");
      });
    },
    new NewMessage({ incoming: true }),
  );
  handlersInstalled = true;
  logger.info("MTProto user relay started");
}

function codeDeliveryDetail(): string {
  if (codeViaApp) {
    return "Telegram sent the code inside the Telegram app, not as a phone notification. Open Telegram on that account and check the chat with Telegram (777000). Click Request again to try SMS.";
  }
  return "Telegram sent a login SMS. If it does not arrive, open the Telegram app and check the official Telegram chat.";
}

export async function startTelegramUserRelay(state: RelayState): Promise<void> {
  if (!credentialsAvailable()) {
    loginState = "missing_credentials";
    logger.warn("MTProto reader is paused until Telegram API credentials are configured");
    return;
  }

  const telegramClient = await ensureConnected();
  if (await telegramClient.checkAuthorization()) {
    loginState = "connected";
    await installHandlers(state);
  } else {
    loginState = "needs_login";
  }
}

export async function requestTelegramLoginCode(): Promise<UserRelayStatus> {
  if (!credentialsAvailable()) return getTelegramUserStatus();
  if (loginBusy) return getTelegramUserStatus();
  loginBusy = true;
  lastError = null;
  try {
    const { apiId, apiHash, phoneNumber } = readerSecrets();
    const telegramClient = await ensureConnected();
    if (await telegramClient.checkAuthorization()) {
      loginState = "connected";
      return getTelegramUserStatus();
    }
    const forceSMS = Boolean(phoneCodeHash);
    const sent = await withTimeout(
      telegramClient.sendCode({ apiId, apiHash }, phoneNumber, forceSMS),
      25000,
      "Telegram sendCode timed out",
    );
    if ("emailRequired" in sent && sent.emailRequired) {
      throw new Error("Telegram asked for email verification, which this login flow does not support.");
    }
    if ("emailCodeSent" in sent && sent.emailCodeSent) {
      throw new Error("Telegram sent the login code to email, which this login flow does not support.");
    }
    phoneCodeHash = sent.phoneCodeHash;
    codeViaApp = Boolean(sent.isCodeViaApp);
    loginState = "code_required";
    logger.info(
      { delivery: codeViaApp ? "telegram_app" : "sms" },
      "Telegram login code requested",
    );
  } catch (error) {
    lastError = rpcErrorMessage(error);
    loginState = "error";
    logger.warn({ err: lastError }, "Telegram login code request failed");
    await resetClient();
  } finally {
    loginBusy = false;
  }
  return getTelegramUserStatus();
}

export async function completeTelegramLogin(
  code?: string,
  password?: string,
  state?: RelayState,
): Promise<UserRelayStatus> {
  if (loginBusy) return getTelegramUserStatus();
  loginBusy = true;
  try {
    const { phoneNumber } = readerSecrets();
    const telegramClient = await ensureConnected();
    if (password && loginState === "password_required") {
      const pwd = await telegramClient.invoke(new Api.account.GetPassword());
      const srp = await computeCheck(pwd, password);
      await telegramClient.invoke(new Api.auth.CheckPassword({ password: srp }));
      loginState = "connected";
      lastError = null;
      if (state) await installHandlers(state);
      return getTelegramUserStatus();
    }
    if (!code?.trim() || !phoneCodeHash) {
      lastError = "Request a verification code before verifying.";
      return getTelegramUserStatus();
    }
    try {
      await telegramClient.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: code.trim(),
        }),
      );
      loginState = "connected";
      lastError = null;
      if (state) await installHandlers(state);
    } catch (error) {
      const message = rpcErrorMessage(error);
      if (message.includes("SESSION_PASSWORD_NEEDED")) {
        loginState = "password_required";
        lastError = null;
      } else {
        lastError = message;
        loginState = "error";
      }
    }
  } catch (error) {
    lastError = rpcErrorMessage(error);
    loginState = "error";
  } finally {
    loginBusy = false;
  }
  return getTelegramUserStatus();
}

export async function runTelegramUserSync(state: RelayState): Promise<string> {
  if (loginState !== "connected") return "MTProto reader is not logged in yet.";
  await installHandlers(state);
  return "MTProto reader is connected and listening for new channel posts.";
}

function missingReaderSecrets(): string[] {
  const { apiId, apiHash, phoneNumber } = readerSecrets();
  const missing: string[] = [];
  if (!Number.isInteger(apiId) || apiId <= 0) missing.push("TELEGRAM_API_ID");
  if (!apiHash) missing.push("TELEGRAM_API_HASH");
  if (!phoneNumber) missing.push("TELEGRAM_PHONE_NUMBER");
  return missing;
}

export function getTelegramUserStatus(): UserRelayStatus {
  if (!credentialsAvailable()) {
    const missing = missingReaderSecrets();
    const waitingOnApiApp = missing.length === 2 &&
      missing.includes("TELEGRAM_API_ID") &&
      missing.includes("TELEGRAM_API_HASH");
    return {
      ok: false,
      username: null,
      detail: waitingOnApiApp
        ? "Phone number is configured. Add TELEGRAM_API_ID and TELEGRAM_API_HASH to finish MTProto login."
        : `Add ${missing.join(" and ")} to start MTProto login.`,
      loginState: "missing_credentials",
      mode: "mtproto_user",
    };
  }
  if (loginState === "connected") {
    return {
      ok: true,
      username: null,
      detail: "The Telegram user account is reading the configured source channels via MTProto.",
      loginState,
      mode: "mtproto_user",
    };
  }
  if (loginState === "code_required") {
    return {
      ok: false,
      username: null,
      detail: codeDeliveryDetail(),
      loginState,
      mode: "mtproto_user",
    };
  }
  if (loginState === "password_required") {
    return {
      ok: false,
      username: null,
      detail: "Telegram asked for the 2FA password. Enter it on the Connection page.",
      loginState,
      mode: "mtproto_user",
    };
  }
  return {
    ok: false,
    username: null,
    detail: lastError ?? "The Telegram user account needs to be logged in.",
    loginState,
    mode: "mtproto_user",
  };
}
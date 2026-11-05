import { logger } from "./logger";

type RelayRules = {
  translate: boolean;
  preserveMedia: boolean;
  addSourceLabel: boolean;
  blockAds: boolean;
  blockedKeywords: string[];
  deliveryChannel: string;
};

type RelaySource = {
  handle: string;
  name: string;
  group: string;
  enabled: boolean;
};

export type RelayPost = {
  id: number;
  sourceHandle: string;
  sourceName: string;
  group: string;
  headline: string;
  body: string;
  status: "published" | "queued" | "blocked";
  mediaType: "image" | "video" | "none";
  mediaUrl: string | null;
  receivedAt: string;
  translated: boolean;
  reason: string | null;
};

type TelegramPhoto = { file_id: string };
type TelegramChat = { username?: string; title?: string };
export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
};
type TelegramMessage = {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  photo?: TelegramPhoto[];
  video?: { file_id: string };
  date?: number;
  reply_to_message?: TelegramMessage;
};
type TelegramUpdate = { update_id: number; channel_post?: TelegramMessage };
type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

export type RelayState = {
  sources: RelaySource[];
  rules: RelayRules;
  posts: RelayPost[];
  nextPostId: number;
};

let updateOffset = 0;
let relayRunning = false;
let pollInFlight = false;

export function uwuify(input: string): string {
  return input
    .replace(/(?:r|l)/gi, (match) => (match === match.toUpperCase() ? "W" : "w"))
    .replace(/n([aeiou])/gi, (_match, vowel: string) => `ny${vowel}`)
    .replace(/ove/gi, "uv")
    .replace(/!+/g, " uwu~")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeStoryText(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  const normalized = normalizeStoryText(text);
  return new Set(
    normalized
      .split(/\s+/)
      .filter((token) => token.length > 2 && !/^(the|and|for|with|that|this|from|into|have|will|your|they|them|into)$/i.test(token)),
  );
}

function similarityScore(left: string, right: string): number {
  const leftSet = tokenSet(left);
  const rightSet = tokenSet(right);
  if (!leftSet.size || !rightSet.size) return 0;
  const overlap = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : overlap / union;
}

export function hasGiveawaySignal(text: string): boolean {
  const normalized = text.toLowerCase();
  const giveawayPattern =
    /(?:giveaway|raffle|airdrop|reward|whitelist|claim(?:\s+(?:free|now|bonus|reward|token))?|join(?:\s+(?:now|us|our|their))?|free\s+(?:money|token|claim|drop)|win(?:\s+(?:prize|reward|bonus))?|bonus\s+drop|prize\s+pool|daily\s+(?:race|raffle)|weekly\s+(?:race|raffle)|exclusive\s+reward|instant\s+withdrawals?)/i;
  return giveawayPattern.test(normalized) ||
    /(?:use\s+(?:our|code)|claim\s+now|join\s+us|join\s+now|promo\s+code|referral|affiliate)/i.test(normalized);
}

function isPromotionalBlock(text: string, blockedKeywords: string[]): boolean {
  const normalized = text.toLowerCase();
  const keywordMatch = blockedKeywords.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
  const promotionalPattern =
    /(?:use (?:our|code)|join (?:us|now|@\w+)(?:\s+for more)?|instant withdrawals?|cashback|affiliate|sponsored|promo(?: code)?|giveaway|claim now|exclusive offer|rakeback|prize pools?|daily race|weekly race|sportsbook|airdrop|whitelist|reward|raffle|free token|free claim|(?:#\s*)?paid\s*[-_ ]?\s*ad|#\s*paidad)/i;
  return keywordMatch || promotionalPattern.test(text) || hasGiveawaySignal(text);
}

export function hasPaidAdMarker(text: string): boolean {
  return [
    /\[\s*paid\s+ad\s*\]/i,
    /(?:#\s*)?paid\s*[-_ ]?\s*ad\b/i,
    /(?:#\s*)?paidad\b/i,
  ].some((pattern) => pattern.test(text));
}

export function isDuplicateStoryPost(
  text: string,
  posts: Array<{ headline?: string; body?: string }>,
  threshold = 0.72,
): boolean {
  const normalizedText = normalizeStoryText(text);
  if (!normalizedText) return false;

  return posts.some((post) => {
    const candidate = `${post.headline ?? ""} ${post.body ?? ""}`;
    const normalizedCandidate = normalizeStoryText(candidate);
    if (!normalizedCandidate || normalizedCandidate === normalizedText) return false;
    return similarityScore(normalizedText, normalizedCandidate) >= threshold;
  });
}

function isStandaloneAdvertisement(
  text: string,
  blockedKeywords: string[],
): boolean {
  const signals = [
    /casino|sportsbook|affiliate|rakeback|cashback|promo|giveaway|airdrop|sponsored/i,
    /instant withdrawals?|use (?:our|code)|claim now|exclusive offer/i,
    /(?:daily|weekly|monthly) (?:race|raffle|prize|pool)/i,
    /(?:https?:\/\/|t\.me\/|@\w+)/i,
  ];
  const signalCount = signals.filter((signal) => signal.test(text)).length;
  return (
    signalCount >= 2 &&
    isPromotionalBlock(text, blockedKeywords) &&
    text.trim().length < 1200
  );
}

function removePromotionalQuotes(
  text: string,
  entities: TelegramMessageEntity[],
  blockedKeywords: string[],
): { cleaned: string; removed: boolean } {
  const promoRanges = entities
    .filter(
      (entity) =>
        (entity.type === "blockquote" ||
          entity.type === "expandable_blockquote") &&
        isPromotionalBlock(
          text.slice(entity.offset, entity.offset + entity.length),
          blockedKeywords,
        ),
    )
    .sort((left, right) => right.offset - left.offset);

  let cleaned = text;
  for (const entity of promoRanges) {
    cleaned =
      cleaned.slice(0, entity.offset) +
      cleaned.slice(entity.offset + entity.length);
  }

  return {
    cleaned: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    removed: promoRanges.length > 0,
  };
}

function removePromotionalBlocks(
  text: string,
  blockedKeywords: string[],
): { cleaned: string; removed: boolean } {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const keptBlocks = blocks.filter(
    (block) => !isPromotionalBlock(block, blockedKeywords),
  );

  if (keptBlocks.length < blocks.length) {
    return { cleaned: keptBlocks.join("\n\n").trim(), removed: true };
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let trailingAdLines = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!isPromotionalBlock(lines[index] ?? "", blockedKeywords)) break;
    trailingAdLines += 1;
  }

  if (trailingAdLines > 0 && trailingAdLines < lines.length) {
    return {
      cleaned: lines.slice(0, -trailingAdLines).join("\n\n").trim(),
      removed: true,
    };
  }

  return { cleaned: text.trim(), removed: false };
}

export function cleanPromotionalContent(
  text: string,
  entities: TelegramMessageEntity[],
  blockedKeywords: string[],
): { cleaned: string; removed: boolean } {
  const withoutQuotes = removePromotionalQuotes(
    text,
    entities,
    blockedKeywords,
  );
  if (isStandaloneAdvertisement(withoutQuotes.cleaned, blockedKeywords)) {
    return { cleaned: "", removed: true };
  }

  const withoutBlocks = removePromotionalBlocks(
    withoutQuotes.cleaned,
    blockedKeywords,
  );
  if (
    withoutBlocks.cleaned &&
    isStandaloneAdvertisement(withoutBlocks.cleaned, blockedKeywords)
  ) {
    return { cleaned: "", removed: true };
  }
  if (withoutBlocks.cleaned && hasGiveawaySignal(withoutBlocks.cleaned)) {
    return { cleaned: "", removed: true };
  }

  return {
    cleaned: withoutBlocks.cleaned,
    removed: withoutQuotes.removed || withoutBlocks.removed,
  };
}

async function telegramCall<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await response.json()) as TelegramResponse<T>;
}

async function publishPost(
  token: string,
  destination: string,
  message: TelegramMessage,
  caption: string,
  preserveMedia: boolean,
): Promise<void> {
  if (preserveMedia && message.photo?.length) {
    await telegramCall(token, "sendPhoto", {
      chat_id: destination,
      photo: message.photo.at(-1)?.file_id,
      caption,
    });
    return;
  }

  if (preserveMedia && message.video?.file_id) {
    await telegramCall(token, "sendVideo", {
      chat_id: destination,
      video: message.video.file_id,
      caption,
    });
    return;
  }

  await telegramCall(token, "sendMessage", {
    chat_id: destination,
    text: caption,
    disable_web_page_preview: false,
  });
}

async function processUpdate(
  token: string,
  update: TelegramUpdate,
  state: RelayState,
): Promise<void> {
  const message = update.channel_post;
  if (!message?.chat.username) return;

  const handle = `@${message.chat.username}`;
  const source = state.sources.find(
    (item) => item.enabled && item.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (!source) return;

  const originalText = message.text ?? message.caption ?? "";
  const mediaType = message.photo?.length
    ? "image"
    : message.video
      ? "video"
      : "none";

  if (isDuplicateStoryPost(originalText, state.posts)) {
    const post: RelayPost = {
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
    };
    state.posts.unshift(post);
    state.posts.splice(40);
    return;
  }

  if (hasPaidAdMarker(originalText)) {
    const post: RelayPost = {
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
    };
    state.posts.unshift(post);
    state.posts.splice(40);
    return;
  }

  const moderation = state.rules.blockAds
    ? cleanPromotionalContent(
        originalText,
        message.entities ?? message.caption_entities ?? [],
        state.rules.blockedKeywords,
      )
    : { cleaned: originalText.trim(), removed: false };
  if (!moderation.cleaned) {
    const post: RelayPost = {
      id: state.nextPostId++,
      sourceHandle: source.handle,
      sourceName: source.name,
      group: source.group,
      headline: "Standalone promotional message",
      body: originalText,
      status: "blocked",
      mediaType: message.photo?.length
        ? "image"
        : message.video
          ? "video"
          : "none",
      mediaUrl: null,
      receivedAt: "just now",
      translated: false,
      reason: "Standalone ad removed",
    };
    state.posts.unshift(post);
    state.posts.splice(40);
    return;
  }

  const cleanedText = moderation.cleaned;
  const headline =
    cleanedText.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ??
    "Untitled update";
  const post: RelayPost = {
    id: state.nextPostId++,
    sourceHandle: source.handle,
    sourceName: source.name,
    group: source.group,
    headline,
    body: cleanedText,
    status: "queued",
    mediaType,
    mediaUrl: null,
    receivedAt: "just now",
    translated: false,
    reason: moderation.removed ? "Ad removed from the end of the post" : null,
  };

  const translatedText = state.rules.translate ? uwuify(cleanedText) : cleanedText;
  const sourceLabel = state.rules.addSourceLabel
    ? `Sources: ${source.handle}\n\n`
    : "";
  const caption = `${sourceLabel}${translatedText}`.trim();
  if (state.rules.deliveryChannel === "Not connected") {
    post.status = "queued";
    state.posts.unshift(post);
    state.posts.splice(40);
    return;
  }

  await publishPost(
    token,
    state.rules.deliveryChannel,
    message,
    caption,
    state.rules.preserveMedia,
  );
  post.status = "published";
  post.body = translatedText;
  post.translated = state.rules.translate;
  state.posts.unshift(post);
  state.posts.splice(40);
}

async function pollOnce(token: string, state: RelayState): Promise<boolean> {
  if (pollInFlight) return false;
  pollInFlight = true;
  try {
    const response = await telegramCall<TelegramUpdate[]>(token, "getUpdates", {
      offset: updateOffset,
      timeout: 15,
      allowed_updates: ["channel_post"],
    });
    if (!response.ok || !response.result) {
      throw new Error(response.description ?? "Telegram getUpdates failed");
    }
    for (const update of response.result) {
      updateOffset = Math.max(updateOffset, update.update_id + 1);
      await processUpdate(token, update, state);
    }
    return true;
  } finally {
    pollInFlight = false;
  }
}

export function startTelegramRelay(state: RelayState): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || relayRunning) return;
  relayRunning = true;

  const loop = async (): Promise<void> => {
    try {
      await pollOnce(token, state);
    } catch (error) {
      logger.warn({ err: error }, "Telegram relay poll failed");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (relayRunning) {
      setTimeout(() => void loop(), 250);
    }
  };

  void loop();
  logger.info("Telegram relay started");
}

export async function runTelegramSync(state: RelayState): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return "Sync is paused until TELEGRAM_BOT_TOKEN is configured.";
  try {
    const accepted = await pollOnce(token, state);
    if (!accepted) return "A relay poll is already in progress.";
  } catch (error) {
    logger.warn({ err: error }, "Manual Telegram sync failed");
    return "Telegram sync could not complete. The relay will retry automatically.";
  }
  return "Sync cycle queued.";
}

export async function getTelegramBotIdentity(): Promise<{
  ok: boolean;
  username: string | null;
  detail: string;
}> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return {
      ok: false,
      username: null,
      detail: "TELEGRAM_BOT_TOKEN is not configured.",
    };
  }

  try {
    const response = await telegramCall<{ username?: string }>(token, "getMe");
    if (!response.ok || !response.result) {
      return {
        ok: false,
        username: null,
        detail: response.description ?? "Telegram rejected the bot token.",
      };
    }
    return {
      ok: true,
      username: response.result.username ?? null,
      detail: "Telegram accepted the bot token.",
    };
  } catch {
    return {
      ok: false,
      username: null,
      detail: "Telegram could not be reached to verify the bot token.",
    };
  }
}
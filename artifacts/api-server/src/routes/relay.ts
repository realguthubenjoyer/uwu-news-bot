import { Router, type IRouter } from "express";
import {
  CreateSourceBody,
  CreateSourceResponse,
  DeleteSourceParams,
  GetConnectionResponse,
  GetDashboardResponse,
  GetRulesResponse,
  ListPostsQueryParams,
  ListPostsResponse,
  ListSourcesQueryParams,
  ListSourcesResponse,
  RunSyncResponse,
  UpdateRulesBody,
  UpdateSourceBody,
  UpdateSourceParams,
} from "@workspace/api-zod";
import type { RelayState } from "../lib/telegram-relay";
import {
  completeTelegramLogin,
  getTelegramUserStatus,
  requestTelegramLoginCode,
  runTelegramUserSync,
} from "../lib/telegram-user-relay";

type Source = {
  id: number;
  handle: string;
  name: string;
  group: string;
  enabled: boolean;
  lastSeen: string;
  postsToday: number;
};

type Post = {
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

const sourceSeed: Array<[string, string, string]> = [
  ["@Alert", "Alert", "Telegram/Com"],
  ["@Media", "Media", "Telegram/Com"],
  ["@Telelakel", "Telelakel", "Telegram/Com"],
  ["@Telenews", "Telenews", "Telegram/Com"],
  ["@Observer", "Observer", "Telegram/Com"],
  ["@Unofficial", "Unofficial", "Telegram/Com"],
  ["@Heritage", "Heritage", "Telegram/Com"],
  ["@Avoidz", "Avoidz", "Telegram/Com"],
  ["@Alert", "Alert", "Crypto Scams/Exploits/Com"],
  ["@Scammed", "Scammed", "Crypto Scams/Exploits/Com"],
  ["@Feds", "Feds", "Crypto Scams/Exploits/Com"],
  ["@Defraud", "Defraud", "Crypto Scams/Exploits/Com"],
  ["@Wary", "Wary", "Crypto Scams/Exploits/Com"],
  ["@Exploit", "Exploit", "Crypto Scams/Exploits/Com"],
  ["@Inspection", "Inspection", "Crypto Scams/Exploits/Com"],
  ["@Avoid", "Avoid", "Crypto Scams/Exploits/Com"],
  ["@ZachXBT", "ZachXBT", "Crypto Scams/Exploits/Com"],
  ["@SableIndex", "SableIndex", "Crypto Scams/Exploits/Com"],
  ["@Hacknet", "Hacknet", "Crypto Scams/Exploits/Com"],
  ["@Clubs", "Clubs", "Crypto Scams/Exploits/Com"],
  ["@Zoinbaze", "Zoinbaze", "Crypto Scams/Exploits/Com"],
  ["@Release", "Release", "Crypto Scams/Exploits/Com"],
  ["@Comland", "Comland", "Crypto Scams/Exploits/Com"],
  ["@DWCgoons", "DWCgoons", "Crypto Scams/Exploits/Com"],
  ["@DWCcove", "DWCcove", "Crypto Scams/Exploits/Com"],
  ["@ComUpdates", "ComUpdates", "Crypto Scams/Exploits/Com"],
  ["@OGUnews", "OGUnews", "OGU News"],
  ["@OGU_Lore", "OGU Lore", "OGU News"],
  ["@OGUwire", "OGUwire", "OGU News"],
];

const now = () => new Date().toISOString();
const sources: Source[] = sourceSeed.map(([handle, name, group], index) => ({
  id: index + 1,
  handle,
  name,
  group,
  enabled: true,
  lastSeen: index < 8 ? "just now" : `${index + 2}m ago`,
  postsToday: Math.max(1, 18 - (index % 11)),
}));

const posts: Post[] = [
  {
    id: 1,
    sourceHandle: "@Hacknet",
    sourceName: "Hacknet",
    group: "Crypto Scams/Exploits/Com",
    headline: "X user claims $24 million stolen in violent crypto attack",
    body: "A user claims four armed attackers assaulted and restrained him before stealing the funds. The account may be connected to the incident.",
    status: "published",
    mediaType: "image",
    mediaUrl: null,
    receivedAt: "2 min ago",
    translated: true,
    reason: null,
  },
  {
    id: 2,
    sourceHandle: "@ZachXBT",
    sourceName: "ZachXBT",
    group: "Crypto Scams/Exploits/Com",
    headline: "NFT project accused of extracting around $17M from investors",
    body: "The project raised funds through a blind auction. Investigators say only a small portion was spent on minting, following a quick money and run model.",
    status: "published",
    mediaType: "image",
    mediaUrl: null,
    receivedAt: "18 min ago",
    translated: true,
    reason: null,
  },
  {
    id: 3,
    sourceHandle: "@Groza",
    sourceName: "Groza",
    group: "Gift News",
    headline: "Crypto project update retained after ad cleanup",
    body: "The main report stays in the relay while the affiliate promotion underneath it is removed before publishing.",
    status: "published",
    mediaType: "none",
    mediaUrl: null,
    receivedAt: "31 min ago",
    translated: true,
    reason: "Ad removed from the end of the post",
  },
  {
    id: 4,
    sourceHandle: "@Lookonchain",
    sourceName: "Lookonchain",
    group: "Crypto",
    headline: "Wallet activity points to a large movement of tokens",
    body: "A dormant wallet moved a large token position after months of inactivity. The transaction is being tracked for follow-up activity.",
    status: "queued",
    mediaType: "video",
    mediaUrl: null,
    receivedAt: "46 min ago",
    translated: false,
    reason: null,
  },
];

let rules = {
  translate: true,
  preserveMedia: true,
  addSourceLabel: true,
  blockAds: true,
  blockedKeywords: [
    "casino",
    "affiliate",
    "promo",
    "giveaway",
    "airdrop",
    "raffle",
    "whitelist",
    "reward",
    "sponsored",
    "paid ad",
    "claim now",
    "join now",
    "free claim",
  ],
  deliveryChannel: "@comnyews",
};

export const relayState: RelayState = {
  sources,
  rules,
  posts,
  nextPostId: 5,
};

const router: IRouter = Router();

router.get("/dashboard", (_req, res) => {
  const data = GetDashboardResponse.parse({
    activeSources: sources.filter((source) => source.enabled).length,
    postsToday: 84,
    blockedToday: 12,
    mediaRate: 68,
    lastSync: "2 min ago",
    syncState: process.env.TELEGRAM_BOT_TOKEN ? "live" : "needs_setup",
  });
  res.json(data);
});

router.get("/sources", (req, res) => {
  const params = ListSourcesQueryParams.parse(req.query);
  const data = sources.filter((source) => !params.group || source.group === params.group);
  res.json(ListSourcesResponse.parse(data));
});

router.post("/sources", (req, res) => {
  const input = CreateSourceBody.parse(req.body);
  const source: Source = {
    id: Math.max(...sources.map((item) => item.id), 0) + 1,
    handle: input.handle.startsWith("@") ? input.handle : `@${input.handle}`,
    name: input.name,
    group: input.group,
    enabled: input.enabled ?? true,
    lastSeen: "not synced",
    postsToday: 0,
  };
  sources.push(source);
  res.status(201).json(CreateSourceResponse.parse(source));
});

router.patch("/sources/:id", (req, res) => {
  const { id } = UpdateSourceParams.parse(req.params);
  const input = UpdateSourceBody.parse(req.body);
  const source = sources.find((item) => item.id === id);
  if (!source) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  Object.assign(source, input);
  res.json(source);
});

router.delete("/sources/:id", (req, res) => {
  const { id } = DeleteSourceParams.parse(req.params);
  const index = sources.findIndex((item) => item.id === id);
  if (index < 0) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  sources.splice(index, 1);
  res.status(204).send();
});

router.get("/posts", (req, res) => {
  const params = ListPostsQueryParams.parse(req.query);
  const data = posts.filter(
    (post) =>
      (!params.status || post.status === params.status) &&
      (!params.group || post.group === params.group),
  );
  res.json(ListPostsResponse.parse(data));
});

router.get("/rules", (_req, res) => {
  res.json(GetRulesResponse.parse(rules));
});

router.get("/mtproto/status", (_req, res) => {
  res.json(getTelegramUserStatus());
});

router.post("/mtproto/request-code", async (_req, res): Promise<void> => {
  res.json(await requestTelegramLoginCode());
});

router.post("/mtproto/verify", async (req, res): Promise<void> => {
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : undefined;
  const password =
    typeof req.body?.password === "string" ? req.body.password : undefined;
  res.json(await completeTelegramLogin(code, password, relayState));
});

router.patch("/rules", (req, res) => {
  const input = UpdateRulesBody.parse(req.body);
  Object.assign(rules, input);
  res.json(rules);
});

router.get("/connection", async (_req, res): Promise<void> => {
  const identity = getTelegramUserStatus();
  const configured = identity.ok;
  res.json(
    GetConnectionResponse.parse({
      status: configured
        ? "connected"
        : identity.loginState === "error"
          ? "error"
          : "needs_setup",
      label: configured
        ? "Reader connected"
        : identity.loginState === "error"
          ? "Reader error"
          : "Reader login needed",
      detail: configured
        ? identity.detail
        : identity.detail,
      botUsername: identity.username,
      tokenConfigured: identity.loginState === "connected",
    }),
  );
});

router.post("/sync", async (req, res): Promise<void> => {
  const queuedAt = now();
  req.log.info({ queuedAt, sourceCount: sources.length }, "Relay sync requested");
  const message = await runTelegramUserSync(relayState);
  res.status(202).json(
    RunSyncResponse.parse({
      queuedAt,
      accepted: getTelegramUserStatus().ok,
      message,
    }),
  );
});

export default router;
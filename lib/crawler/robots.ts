import robotsParser from "robots-parser";

export const CRAWLER_USER_AGENT = "ChatWithWebsiteBot/1.0 (+educational assignment)";

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export async function getRobotsForOrigin(
  origin: string,
): Promise<ReturnType<typeof robotsParser>> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  const robotsUrl = `${origin}/robots.txt`;
  let text = "";
  try {
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) text = await res.text();
  } catch {
    // Treat missing or unreachable robots.txt as allow-all.
  }

  const parser = robotsParser(robotsUrl, text);
  robotsCache.set(origin, parser);
  return parser;
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const { origin } = new URL(url);
  const robots = await getRobotsForOrigin(origin);
  return robots.isAllowed(url, CRAWLER_USER_AGENT) ?? true;
}

export async function getCrawlDelayMs(url: string): Promise<number> {
  const { origin } = new URL(url);
  const robots = await getRobotsForOrigin(origin);
  const delay = robots.getCrawlDelay(CRAWLER_USER_AGENT);
  if (typeof delay === "number" && delay > 0) {
    return Math.min(delay * 1000, 5000);
  }
  return Number(process.env.CRAWL_DELAY_MS ?? 800);
}

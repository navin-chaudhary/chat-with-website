export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function getDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, "");
}

export function isSameSite(url: string, baseDomain: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host === baseDomain || host.endsWith(`.${baseDomain}`);
  } catch {
    return false;
  }
}

export function resolveUrl(href: string, base: string): string | null {
  try {
    const resolved = new URL(href, base);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

export function siteIdFromUrl(url: string): string {
  const domain = getDomain(url);
  return Buffer.from(domain).toString("base64url");
}

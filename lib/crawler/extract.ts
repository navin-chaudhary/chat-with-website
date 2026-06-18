import * as cheerio from "cheerio";

const BOILERPLATE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "aside",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-label*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="cookie" i]',
  '[class*="banner" i]',
  ".nav",
  ".navbar",
  ".footer",
  ".site-footer",
  ".header",
  ".site-header",
  ".sidebar",
  ".menu",
  ".breadcrumb",
  ".breadcrumbs",
];

export function extractPageContent(
  html: string,
  pageUrl: string,
): { title: string; text: string; links: string[] } {
  const $ = cheerio.load(html);

  for (const selector of BOILERPLATE_SELECTORS) {
    $(selector).remove();
  }

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    pageUrl;

  const main =
    $("main").text().trim() ||
    $("article").text().trim() ||
    $('[role="main"]').text().trim() ||
    $("body").text().trim();

  const text = main
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.add(href);
  });

  return { title, text, links: [...links] };
}

import { NextResponse } from "next/server";

export function GET() {
  const body = [
    "User-agent: *",
    "Disallow: /books",
    "Disallow: /books/",
    "Disallow: /purchased",
    "Disallow: /purchased/",
    "Disallow: /create",
    "Disallow: /create/",
    "Disallow: /checkout",
    "Disallow: /checkout/",
    "Disallow: /account",
    "Disallow: /account/",
    "Disallow: /support",
    "Disallow: /support/",
    "Allow: /",
    "Sitemap: https://kid-to-story.life/sitemap.xml",
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}


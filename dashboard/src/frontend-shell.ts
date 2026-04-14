import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ServerResponse } from "node:http";

export type FrontendPageName =
  | "home"
  | "get-started"
  | "privacy-policy"
  | "terms-of-service"
  | "login"
  | "change-password"
  | "dashboard"
  | "created-user"
  | "not-found"
  | "error";

type FrontendManifestEntry = {
  file: string;
  css?: string[];
};

const frontendDistRoot = new URL("../client-dist/", import.meta.url);
const publicAssetRoot = new URL("../public/", import.meta.url);

let cachedManifest: Record<string, FrontendManifestEntry> | null = null;

export function renderFrontendPage(input: {
  title: string;
  page: FrontendPageName;
  payload: unknown;
}): string {
  const assets = getFrontendEntryAssets();
  const cssLinks = assets.css
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("");

  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#030712" />
    <title>${escapeHtml(input.title)}</title>
    <link rel="icon" type="image/png" href="/assets/icon-brain.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
    ${cssLinks}
  </head>
  <body>
    <div id="app"></div>
    <script>
      window.__MOVIC_CONTEXT__ = ${serializeForInlineScript({
        page: input.page,
        payload: input.payload
      })};
    </script>
    <script type="module" src="${escapeHtml(assets.script)}"></script>
  </body>
</html>`;
}

export async function handleFrontendAssetRequest(
  response: ServerResponse,
  pathname: string
): Promise<void> {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");

  if (!relativePath.startsWith("app/") || relativePath.includes("..")) {
    response.statusCode = 400;
    response.end("Invalid asset path");
    return;
  }

  const assetPath = relativePath.slice(4);

  try {
    const body = await readFile(new URL(assetPath, frontendDistRoot));
    response.statusCode = 200;
    response.setHeader("content-type", getAssetContentType(assetPath));
    response.setHeader("cache-control", "public, max-age=3600");
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}

export async function handlePublicAssetRequest(
  response: ServerResponse,
  pathname: string
): Promise<void> {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, "");

  if (!relativePath.startsWith("assets/") || relativePath.includes("..")) {
    response.statusCode = 400;
    response.end("Invalid asset path");
    return;
  }

  try {
    const body = await readFile(new URL(relativePath, publicAssetRoot));
    response.statusCode = 200;
    response.setHeader("content-type", getAssetContentType(relativePath));
    response.setHeader("cache-control", "public, max-age=3600");
    response.end(body);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}

function getFrontendEntryAssets(): { script: string; css: string[] } {
  const manifest = getFrontendManifest();
  const entry = manifest["index.html"];

  if (!entry?.file) {
    throw new Error("Não encontrei o entrypoint do frontend compilado.");
  }

  return {
    script: `/app/${entry.file}`,
    css: (entry.css ?? []).map((href) => `/app/${href}`)
  };
}

function getFrontendManifest(): Record<string, FrontendManifestEntry> {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestUrl = new URL("manifest.json", frontendDistRoot);
  const contents = readFileSync(manifestUrl, "utf-8");
  cachedManifest = JSON.parse(contents) as Record<string, FrontendManifestEntry>;
  return cachedManifest;
}

function getAssetContentType(pathname: string): string {
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  if (pathname.endsWith(".png")) {
    return "image/png";
  }

  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (pathname.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (pathname.endsWith(".webp")) {
    return "image/webp";
  }

  if (pathname.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }

  return "application/octet-stream";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

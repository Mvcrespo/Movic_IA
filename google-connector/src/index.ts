import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import {
  createGoogleAuthUrl,
  deleteSingleEventFromGoogle,
  ensureGoogleSyncSchema,
  exchangeGoogleAuthorizationCode,
  syncGoogleCalendarNow,
  syncSingleEventToGoogle,
  type GoogleSyncDependencies
} from "./google-sync.js";

type GoogleEventSyncRequest = {
  eventId: string;
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

type CategoryDefinition = {
  name: string;
  aliases: string[];
};

const env = {
  port: Number(process.env.GOOGLE_CONNECTOR_PORT ?? "8007"),
  postgresUrl: process.env.POSTGRES_URL ?? "",
  configPostgresUrl: process.env.CONFIG_POSTGRES_URL ?? "",
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY ?? "",
  internalApiToken: process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  googleSyncIntervalMs: Number(process.env.GOOGLE_SYNC_INTERVAL_MS ?? "300000"),
  appleConnectorUrl: process.env.APPLE_CONNECTOR_URL ?? "http://apple-connector:8006",
  notionConnectorUrl: process.env.NOTION_CONNECTOR_URL ?? "http://notion-connector:8008"
};

validateEnv();

const eventPool = new Pool({ connectionString: env.postgresUrl });
const configPool = new Pool({ connectionString: env.configPostgresUrl });

const controlledCategories: CategoryDefinition[] = [
  { name: "Reuniao", aliases: ["reuniao", "meeting", "conferencia", "workshop", "sync"] },
  { name: "Consulta", aliases: ["consulta", "medico", "dentista", "hospital", "terapia"] },
  { name: "Trabalho", aliases: ["trabalho", "work", "job", "turno"] },
  { name: "Estudo", aliases: ["estudo", "estudar", "aula", "faculdade", "universidade"] },
  { name: "Treino", aliases: ["treino", "ginasio", "academia", "desporto", "gym"] },
  { name: "Viagem", aliases: ["viagem", "ferias", "voo", "trip", "hotel"] },
  { name: "Jantar", aliases: ["jantar", "ceia"] },
  { name: "Lanche", aliases: ["lanche", "almoco", "brunch", "cafe", "snack"] },
  { name: "Aniversario", aliases: ["aniversario", "festa de anos", "anos"] },
  { name: "Outros", aliases: ["outros", "outro", "geral", "misc"] }
];

const googleSyncDeps: GoogleSyncDependencies = {
  eventPool,
  configPool,
  timezone: env.timezone,
  configEncryptionKey: env.configEncryptionKey,
  googleClientId: env.googleClientId,
  googleClientSecret: env.googleClientSecret,
  googleRedirectUri: env.googleRedirectUri,
  logger: console,
  resolveCategoryLabel,
  notifyAppleEventSync: async (eventId: string) => {
    await notifyConnector(env.appleConnectorUrl, "/providers/apple/events/sync", eventId);
  },
  notifyAppleEventDelete: async (eventId: string) => {
    await notifyConnector(env.appleConnectorUrl, "/providers/apple/events/delete", eventId);
  },
  notifyNotionEventSync: async (eventId: string) => {
    await notifyConnector(env.notionConnectorUrl, "/providers/notion/events/sync", eventId);
  },
  notifyNotionEventDelete: async (eventId: string) => {
    await notifyConnector(env.notionConnectorUrl, "/providers/notion/events/delete", eventId);
  }
};

let googleSyncTimer: NodeJS.Timeout | null = null;

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        service: "google-connector"
      });
    }

    if (method === "POST" && path === "/providers/google/auth-url") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      const result = await createGoogleAuthUrl(googleSyncDeps, dashboardUserId);
      return sendJson(response, 200, { success: true, ...result });
    }

    if (method === "POST" && path === "/providers/google/oauth/exchange") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      const payload = (await readJsonBody(request)) as { code?: string; state?: string };
      if (!payload?.code || !payload?.state) {
        throw new HttpError(400, "Pedido incompleto.");
      }
      const result = await exchangeGoogleAuthorizationCode(googleSyncDeps, {
        code: payload.code,
        state: payload.state
      }, dashboardUserId);
      return sendJson(response, 200, { success: true, ...result });
    }

    if (method === "POST" && path === "/providers/google/sync-now") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = getOptionalDashboardUserId(request);
      const result = await syncGoogleCalendarNow(googleSyncDeps, dashboardUserId ?? undefined);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/providers/google/events/sync") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as GoogleEventSyncRequest;
      validateEventSyncPayload(payload);
      await syncSingleEventToGoogle(googleSyncDeps, payload.eventId);
      return sendJson(response, 200, { success: true, eventId: payload.eventId });
    }

    if (method === "POST" && path === "/providers/google/events/delete") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as GoogleEventSyncRequest;
      validateEventSyncPayload(payload);
      await deleteSingleEventFromGoogle(googleSyncDeps, payload.eventId);
      return sendJson(response, 200, { success: true, eventId: payload.eventId });
    }

    return sendJson(response, 404, { error: "Not Found" });
  } catch (error) {
    console.error("[google-connector] Erro:", error);
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return sendJson(response, statusCode, {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

async function startServer(): Promise<void> {
  await ensureGoogleSyncSchema(googleSyncDeps);
  server.listen(env.port, () => {
    console.log(`[google-connector] A escutar na porta ${env.port}`);
  });
  startBackgroundSync();
}

function startBackgroundSync(): void {
  if (googleSyncTimer || Number.isNaN(env.googleSyncIntervalMs) || env.googleSyncIntervalMs < 60_000) {
    return;
  }

  googleSyncTimer = setInterval(() => {
    void runBackgroundSync();
  }, env.googleSyncIntervalMs);
}

async function runBackgroundSync(): Promise<void> {
  const result = await syncGoogleCalendarNow(googleSyncDeps);
  if (!result.success) {
    console.warn(`[google-connector] Sync Google em background falhou: ${result.message}`);
  }
}

function resolveCategoryLabel(title: string, description?: string, explicitCategory?: string): string {
  const explicit = normalizeExplicitCategory(explicitCategory);
  if (explicit) {
    return explicit;
  }

  const fromTitle = inferControlledCategoryFromText(title);
  if (fromTitle) {
    return fromTitle;
  }

  if (description) {
    const fromDescription = inferControlledCategoryFromText(description);
    if (fromDescription) {
      return fromDescription;
    }
  }

  return "Outros";
}

function inferControlledCategoryFromText(text: string): string | null {
  const normalized = normalizeLooseText(text);
  if (!normalized) {
    return null;
  }

  for (const definition of controlledCategories) {
    if (definition.aliases.some((alias) => normalized.includes(normalizeLooseText(alias)))) {
      return definition.name;
    }
  }

  return null;
}

function normalizeExplicitCategory(rawCategory: string | undefined): string | null {
  if (typeof rawCategory !== "string") {
    return null;
  }

  const trimmed = rawCategory.trim();
  if (!trimmed) {
    return null;
  }

  const controlled = inferControlledCategoryFromText(trimmed);
  if (controlled) {
    return controlled;
  }

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(trimmed)) {
    return null;
  }

  const normalized = normalizeLooseText(trimmed);
  if (
    normalized === "holidays" ||
    normalized === "holiday" ||
    normalized === "feriados" ||
    normalized === "feriados em portugal" ||
    normalized === "reminders" ||
    normalized === "reminder" ||
    normalized === "lembretes"
  ) {
    return null;
  }

  return "Outros";
}

function normalizeLooseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Body JSON inválido.");
  }
}

function validateEventSyncPayload(payload: GoogleEventSyncRequest): void {
  if (!payload?.eventId || typeof payload.eventId !== "string") {
    throw new HttpError(400, "Campo eventId em falta.");
  }
}

async function notifyConnector(baseUrl: string, path: string, eventId: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({ eventId })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `HTTP ${response.status}`);
  }
}

function ensureAuthorizedInternalRequest(request: IncomingMessage): void {
  const token = request.headers["x-internal-token"];
  if (token !== env.internalApiToken) {
    throw new HttpError(401, "Não autorizado.");
  }
}

function requireDashboardUserId(request: IncomingMessage): string {
  const value = request.headers["x-dashboard-user-id"];
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Falta x-dashboard-user-id.");
  }

  return value.trim();
}

function getOptionalDashboardUserId(request: IncomingMessage): string | null {
  const value = request.headers["x-dashboard-user-id"];
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function validateEnv(): void {
  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("GOOGLE_CONNECTOR_PORT deve ser um número válido.");
  }

  if (!env.postgresUrl) {
    throw new Error("POSTGRES_URL é obrigatória.");
  }

  if (!env.configPostgresUrl) {
    throw new Error("CONFIG_POSTGRES_URL é obrigatória.");
  }

  if (!env.internalApiToken) {
    throw new Error("DASHBOARD_INTERNAL_API_TOKEN é obrigatória.");
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[google-connector] A terminar (${signal})...`);
  if (googleSyncTimer) {
    clearInterval(googleSyncTimer);
  }
  await Promise.allSettled([eventPool.end(), configPool.end()]);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer().catch((error) => {
  console.error("[google-connector] Falha ao arrancar:", error);
  process.exit(1);
});

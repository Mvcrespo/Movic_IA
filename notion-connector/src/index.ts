import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import {
  createNotionAuthUrl,
  deleteSingleEventFromNotion,
  disableNotionConnection,
  ensureNotionSyncSchema,
  exchangeNotionAuthorizationCode,
  getNotionConnectionSummary,
  handleNotionWebhook,
  syncNotionNow,
  syncSingleEventToNotion,
  type NotionSyncDependencies
} from "./notion-sync.js";

type NotionEventSyncRequest = { eventId: string };

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const env = {
  port: Number(process.env.NOTION_CONNECTOR_PORT ?? "8008"),
  postgresUrl:
    process.env.POSTGRES_URL ??
    "postgres://agentpulse:agentpulse_dev_password@postgres:5432/agentpulse",
  configPostgresUrl:
    process.env.CONFIG_POSTGRES_URL ??
    "postgres://agentpulse_config:agentpulse_config_password@config-postgres:5432/agentpulse_config",
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY ?? "",
  internalApiToken:
    process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "pulse_dashboard_internal_token_change_me",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  syncIntervalMs: Number(process.env.NOTION_SYNC_INTERVAL_MS ?? "60000"),
  notionClientId: process.env.NOTION_CLIENT_ID ?? "",
  notionClientSecret: process.env.NOTION_CLIENT_SECRET ?? "",
  notionRedirectUri: process.env.NOTION_REDIRECT_URI ?? "",
  notionApiVersion: process.env.NOTION_API_VERSION ?? "2022-06-28",
  appleConnectorUrl: process.env.APPLE_CONNECTOR_URL ?? "http://apple-connector:8006",
  googleConnectorUrl: process.env.GOOGLE_CONNECTOR_URL ?? "http://google-connector:8007"
};

validateEnv();

const eventPool = new Pool({ connectionString: env.postgresUrl });
const configPool = new Pool({ connectionString: env.configPostgresUrl });

const notionSyncDeps: NotionSyncDependencies = {
  eventPool,
  configPool,
  timezone: env.timezone,
  configEncryptionKey: env.configEncryptionKey,
  notionClientId: env.notionClientId,
  notionClientSecret: env.notionClientSecret,
  notionRedirectUri: env.notionRedirectUri,
  notionApiVersion: env.notionApiVersion,
  logger: console,
  resolveCategoryLabel,
  notifyAppleEventSync: async (eventId) =>
    notifyConnector(env.appleConnectorUrl, "/providers/apple/events/sync", eventId),
  notifyAppleEventDelete: async (eventId) =>
    notifyConnector(env.appleConnectorUrl, "/providers/apple/events/delete", eventId),
  notifyGoogleEventSync: async (eventId) =>
    notifyConnector(env.googleConnectorUrl, "/providers/google/events/sync", eventId),
  notifyGoogleEventDelete: async (eventId) =>
    notifyConnector(env.googleConnectorUrl, "/providers/google/events/delete", eventId)
};

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, { status: "ok", service: "notion-connector" });
    }

    if (method === "POST" && path === "/providers/notion/auth-url") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      const result = await createNotionAuthUrl(notionSyncDeps, dashboardUserId);
      return sendJson(response, 200, { success: true, ...result });
    }

    if (method === "POST" && path === "/providers/notion/oauth/exchange") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      const payload = (await readJsonBody(request)) as { code?: string; state?: string };
      if (!payload?.code || !payload?.state) {
        throw new HttpError(400, "Pedido incompleto.");
      }
      const result = await exchangeNotionAuthorizationCode(notionSyncDeps, {
        code: payload.code,
        state: payload.state
      }, dashboardUserId);
      return sendJson(response, 200, { success: true, ...result });
    }

    if (method === "POST" && path === "/providers/notion/sync-now") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = getOptionalDashboardUserId(request);
      const result = await syncNotionNow(notionSyncDeps, dashboardUserId ?? undefined);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/providers/notion/disable") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      await disableNotionConnection(notionSyncDeps, dashboardUserId);
      return sendJson(response, 200, { success: true });
    }

    if (method === "GET" && path === "/providers/notion/summary") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = requireDashboardUserId(request);
      const result = await getNotionConnectionSummary(notionSyncDeps, dashboardUserId);
      return sendJson(response, 200, { success: true, connection: result });
    }

    if (method === "POST" && path === "/providers/notion/events/sync") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as NotionEventSyncRequest;
      validateEventSyncPayload(payload);
      await syncSingleEventToNotion(notionSyncDeps, payload.eventId);
      return sendJson(response, 200, { success: true, eventId: payload.eventId });
    }

    if (method === "POST" && path === "/providers/notion/events/delete") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as NotionEventSyncRequest;
      validateEventSyncPayload(payload);
      await deleteSingleEventFromNotion(notionSyncDeps, payload.eventId);
      return sendJson(response, 200, { success: true, eventId: payload.eventId });
    }

    if (method === "POST" && path === "/providers/notion/webhook") {
      const rawBody = await readBody(request);
      const result = await handleNotionWebhook(notionSyncDeps, rawBody, request.headers);
      return sendJson(response, 200, result);
    }

    return sendJson(response, 404, { error: "Not Found" });
  } catch (error) {
    console.error("[notion-connector] Erro:", error);
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    return sendJson(response, statusCode, {
      success: false,
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

async function startServer(): Promise<void> {
  await ensureNotionSyncSchema(notionSyncDeps);

  server.listen(env.port, () => {
    console.log(`[notion-connector] A escutar na porta ${env.port}`);
    console.log(`[notion-connector] Sync periódica ativa a cada ${env.syncIntervalMs}ms`);
  });

  if (env.syncIntervalMs > 0) {
    setInterval(async () => {
      try {
        const summary = await syncNotionNow(notionSyncDeps);
        if (
          summary.importedLocal > 0 ||
          summary.updatedLocal > 0 ||
          summary.deletedLocal > 0 ||
          summary.createdRemote > 0 ||
          summary.updatedRemote > 0 ||
          summary.deletedRemote > 0
        ) {
          console.log(
            `[notion-connector] Sync periódica concluída | importedLocal=${summary.importedLocal} updatedLocal=${summary.updatedLocal} deletedLocal=${summary.deletedLocal} createdRemote=${summary.createdRemote} updatedRemote=${summary.updatedRemote} deletedRemote=${summary.deletedRemote} skipped=${summary.skipped}`
          );
        }
      } catch (error) {
        console.error("[notion-connector] Sync periódica falhou:", error);
      }
    }, env.syncIntervalMs);
  }
}

function resolveCategoryLabel(title: string, description?: string, explicitCategory?: string): string {
  const fromExplicit = sanitizeText(explicitCategory);
  if (fromExplicit) return fromExplicit;

  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (text.includes("reuni")) return "Reuniao";
  if (text.includes("consult") || text.includes("medic") || text.includes("dent")) return "Consulta";
  if (text.includes("trabalho") || text.includes("work") || text.includes("job")) return "Trabalho";
  if (text.includes("estudo") || text.includes("aula") || text.includes("universidade")) return "Estudo";
  if (text.includes("treino") || text.includes("gym") || text.includes("ginas")) return "Treino";
  if (text.includes("viagem") || text.includes("ferias") || text.includes("hotel")) return "Viagem";
  if (text.includes("jantar")) return "Jantar";
  if (text.includes("lanche") || text.includes("almoco") || text.includes("brunch")) return "Lanche";
  if (text.includes("anivers")) return "Aniversario";
  return "Outros";
}

async function notifyConnector(baseUrl: string, path: string, eventId: string): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({ eventId })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const raw = await readBody(request);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Body JSON inválido.");
  }
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateEventSyncPayload(payload: NotionEventSyncRequest): void {
  if (!payload?.eventId || typeof payload.eventId !== "string") {
    throw new HttpError(400, "Campo eventId em falta.");
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
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function validateEnv(): void {
  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("NOTION_CONNECTOR_PORT deve ser um número válido.");
  }
  if (Number.isNaN(env.syncIntervalMs) || env.syncIntervalMs < 0) {
    throw new Error("NOTION_SYNC_INTERVAL_MS deve ser um número válido.");
  }
  if (!env.postgresUrl) throw new Error("POSTGRES_URL é obrigatória.");
  if (!env.configPostgresUrl) throw new Error("CONFIG_POSTGRES_URL é obrigatória.");
  if (!env.internalApiToken) {
    throw new Error("DASHBOARD_INTERNAL_API_TOKEN é obrigatória.");
  }
}

void startServer().catch((error) => {
  console.error("[notion-connector] Falha ao arrancar:", error);
  process.exit(1);
});

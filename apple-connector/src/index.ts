import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { Pool } from "pg";
import {
  ensureAppleSyncSchema,
  type AppleSyncDependencies,
  syncAppleCalendarNow,
  syncSingleEventToApple,
  deleteSingleEventFromApple,
  testAppleConnection,
  cleanupAutoCreatedHolidayCalendars
} from "./apple-sync.js";

type AppleConnectionTestRequest = {
  accountEmail: string;
  appSpecificPassword: string;
};

type AppleEventSyncRequest = {
  eventId: string;
};

type AppleSyncNowResponse = {
  success: boolean;
  message: string;
  importedLocal: number;
  updatedLocal: number;
  deletedLocal: number;
  createdRemote: number;
  updatedRemote: number;
  deletedRemote: number;
  skipped: number;
  lastError: string | null;
};

type AppleCleanupResponse = {
  success: boolean;
  deletedCount: number;
  deletedNames: string[];
};

type CategoryDefinition = {
  name: string;
  aliases: string[];
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const env = {
  port: Number(process.env.APPLE_CONNECTOR_PORT ?? "8006"),
  postgresUrl: process.env.POSTGRES_URL ?? "",
  configPostgresUrl: process.env.CONFIG_POSTGRES_URL ?? "",
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY ?? "",
  internalApiToken: process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  appleCaldavUrl: process.env.APPLE_CALDAV_URL ?? "https://caldav.icloud.com",
  appleSyncIntervalMs: Number(process.env.APPLE_SYNC_INTERVAL_MS ?? "300000"),
  googleConnectorUrl: process.env.GOOGLE_CONNECTOR_URL ?? "http://google-connector:8007",
  notionConnectorUrl: process.env.NOTION_CONNECTOR_URL ?? "http://notion-connector:8008"
};

validateEnv();

const eventPool = new Pool({
  connectionString: env.postgresUrl
});

const configPool = new Pool({
  connectionString: env.configPostgresUrl
});

const appleSyncDeps: AppleSyncDependencies = {
  eventPool,
  configPool,
  timezone: env.timezone,
  configEncryptionKey: env.configEncryptionKey,
  serverUrl: env.appleCaldavUrl,
  logger: console,
  resolveCategoryLabel,
  notifyGoogleEventSync: async (eventId: string) => {
    await notifyGoogleConnector("/providers/google/events/sync", eventId);
  },
  notifyGoogleEventDelete: async (eventId: string) => {
    await notifyGoogleConnector("/providers/google/events/delete", eventId);
  },
  notifyNotionEventSync: async (eventId: string) => {
    await notifyNotionConnector("/providers/notion/events/sync", eventId);
  },
  notifyNotionEventDelete: async (eventId: string) => {
    await notifyNotionConnector("/providers/notion/events/delete", eventId);
  }
};

let appleSyncTimer: NodeJS.Timeout | null = null;

const controlledCategories: CategoryDefinition[] = [
  {
    name: "Reuniao",
    aliases: [
      "reuniao",
      "reuni�o",
      "meeting",
      "conferencia",
      "confer�ncia",
      "workshop",
      "seminario",
      "semin�rio",
      "palestra",
      "apresentacao",
      "apresenta��o",
      "briefing",
      "kickoff",
      "sync"
    ]
  },
  {
    name: "Consulta",
    aliases: [
      "consulta",
      "consulta medica",
      "consulta m�dica",
      "medico",
      "m�dico",
      "dentista",
      "hospital",
      "terapia",
      "psicologo",
      "psic�logo",
      "exame",
      "fisioterapia"
    ]
  },
  {
    name: "Trabalho",
    aliases: ["trabalho", "trabalhar", "turno", "servico", "servi�o", "work", "job"]
  },
  {
    name: "Estudo",
    aliases: [
      "estudo",
      "estudar",
      "aula",
      "faculdade",
      "universidade",
      "projeto academico",
      "projeto acad�mico",
      "teste",
      "exame"
    ]
  },
  {
    name: "Treino",
    aliases: [
      "treino",
      "ginasio",
      "gin�sio",
      "academia",
      "desporto",
      "corrida",
      "futebol",
      "padel",
      "gym"
    ]
  },
  {
    name: "Viagem",
    aliases: [
      "viagem",
      "ferias",
      "f�rias",
      "voo",
      "comboio",
      "autocarro",
      "aeroporto",
      "hotel",
      "flight",
      "trip"
    ]
  },
  {
    name: "Jantar",
    aliases: ["jantar", "ceia"]
  },
  {
    name: "Lanche",
    aliases: [
      "lanche",
      "almoco",
      "almo�o",
      "pequeno almoco",
      "pequeno almo�o",
      "brunch",
      "cafe",
      "caf�",
      "snack"
    ]
  },
  {
    name: "Aniversario",
    aliases: ["aniversario", "anivers�rio", "festa de anos", "anos"]
  },
  {
    name: "Outros",
    aliases: ["outros", "outro", "geral", "misc"]
  }
];

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const path = request.url ?? "/";

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        service: "apple-connector"
      });
    }

    if (method === "POST" && path === "/providers/apple/test") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as AppleConnectionTestRequest;
      validateAppleConnectionTestPayload(payload);
      const result = await testAppleConnection(appleSyncDeps, payload);
      return sendJson(response, 200, {
        success: true,
        calendars: result.calendars,
        defaultCalendar: result.defaultCalendar
      });
    }

    if (method === "POST" && path === "/providers/apple/sync-now") {
      ensureAuthorizedInternalRequest(request);
      const dashboardUserId = getOptionalDashboardUserId(request);
      const result = await syncAppleCalendarNow(appleSyncDeps, dashboardUserId ?? undefined);
      const responseBody: AppleSyncNowResponse = result;
      return sendJson(response, 200, responseBody);
    }

    if (method === "POST" && path === "/providers/apple/cleanup-holidays") {
      ensureAuthorizedInternalRequest(request);
      const result = await cleanupAutoCreatedHolidayCalendars(appleSyncDeps);
      const responseBody: AppleCleanupResponse = {
        success: true,
        deletedCount: result.deletedCount,
        deletedNames: result.deletedNames
      };
      return sendJson(response, 200, responseBody);
    }

    if (method === "POST" && path === "/providers/apple/events/sync") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as AppleEventSyncRequest;
      validateAppleEventSyncPayload(payload);
      await syncSingleEventToApple(appleSyncDeps, payload.eventId);
      return sendJson(response, 200, {
        success: true,
        eventId: payload.eventId
      });
    }

    if (method === "POST" && path === "/providers/apple/events/delete") {
      ensureAuthorizedInternalRequest(request);
      const payload = (await readJsonBody(request)) as AppleEventSyncRequest;
      validateAppleEventSyncPayload(payload);
      await deleteSingleEventFromApple(appleSyncDeps, payload.eventId);
      return sendJson(response, 200, {
        success: true,
        eventId: payload.eventId
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[apple-connector] Erro:", error);
    return sendJson(response, error instanceof HttpError ? error.statusCode : 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

async function startServer(): Promise<void> {
  await ensureAppleSyncSchema(appleSyncDeps);
  scheduleAppleBidirectionalSync();
  server.listen(env.port, () => {
    console.log(`[apple-connector] A escutar na porta ${env.port}`);
  });
}

function scheduleAppleBidirectionalSync(): void {
  if (appleSyncTimer || Number.isNaN(env.appleSyncIntervalMs) || env.appleSyncIntervalMs < 60_000) {
    return;
  }

  appleSyncTimer = setInterval(() => {
    void runAppleSyncInBackground();
  }, env.appleSyncIntervalMs);

  setTimeout(() => {
    void runAppleSyncInBackground();
  }, 20_000);
}

async function runAppleSyncInBackground(): Promise<void> {
  const result = await syncAppleCalendarNow(appleSyncDeps);
  if (result.success || result.skipped > 0) {
    return;
  }

  console.warn(`[apple-connector] Sync Apple em background falhou: ${result.message}`);
}

function ensureAuthorizedInternalRequest(request: IncomingMessage): void {
  const header =
    request.headers["x-internal-token"] ??
    request.headers.authorization?.replace(/^Bearer\s+/iu, "");

  const authorized = Array.isArray(header)
    ? header.includes(env.internalApiToken)
    : typeof header === "string" && header === env.internalApiToken;

  if (!authorized) {
    throw new HttpError(401, "Nao autorizado");
  }
}

function getOptionalDashboardUserId(request: IncomingMessage): string | null {
  const value = request.headers["x-dashboard-user-id"];
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

async function notifyGoogleConnector(path: string, eventId: string): Promise<void> {
  const response = await fetch(`${env.googleConnectorUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({ eventId })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
}

async function notifyNotionConnector(path: string, eventId: string): Promise<void> {
  const response = await fetch(`${env.notionConnectorUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({ eventId })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }
}

function validateAppleConnectionTestPayload(payload: AppleConnectionTestRequest): void {
  if (!payload || typeof payload !== "object") {
    throw new HttpError(400, "Pedido Apple invalido.");
  }

  if (!payload.accountEmail?.trim()) {
    throw new HttpError(400, "O email Apple e obrigatorio.");
  }

  if (!payload.appSpecificPassword?.trim()) {
    throw new HttpError(400, "A app-specific password e obrigatoria.");
  }
}

function validateAppleEventSyncPayload(payload: AppleEventSyncRequest): void {
  if (!payload || typeof payload !== "object" || !payload.eventId?.trim()) {
    throw new HttpError(400, "eventId e obrigatorio.");
  }
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw) as unknown;
}

function sendJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function resolveCategoryLabel(
  title: string,
  description?: string,
  explicitCategory?: string
): string {
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

  const normalizedLabel = normalizeCategoryLabel(trimmed);
  if (!normalizedLabel || isGenericCategoryLabel(normalizedLabel)) {
    return null;
  }

  return normalizedLabel;
}

function normalizeCategoryLabel(value: string): string | null {
  const trimmed = value.replace(/\s+/gu, " ").trim();
  if (!trimmed) {
    return null;
  }

  const words = trimmed.split(" ");
  return words
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("pt-PT");
      if (index > 0 && ["de", "da", "do", "dos", "das", "e"].includes(lower)) {
        return lower;
      }

      return `${word.charAt(0).toLocaleUpperCase("pt-PT")}${word.slice(1).toLocaleLowerCase("pt-PT")}`;
    })
    .join(" ");
}

function isGenericCategoryLabel(value: string): boolean {
  const normalized = normalizeLooseText(value);
  return ["categoria", "tipo", "geral", "outros", "outro", "misc"].includes(normalized);
}

function normalizeLooseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function validateEnv(): void {
  if (!env.internalApiToken) {
    throw new Error("DASHBOARD_INTERNAL_API_TOKEN é obrigatória.");
  }

  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("APPLE_CONNECTOR_PORT deve ser um n�mero v�lido.");
  }

  if (!env.postgresUrl) {
    throw new Error("POSTGRES_URL � obrigat�ria.");
  }

  if (!env.configPostgresUrl) {
    throw new Error("CONFIG_POSTGRES_URL � obrigat�ria.");
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[apple-connector] A terminar (${signal})...`);
  if (appleSyncTimer) {
    clearInterval(appleSyncTimer);
  }

  await configPool.end().catch(() => undefined);
  await eventPool.end().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer().catch((error) => {
  console.error("[apple-connector] Falha ao arrancar:", error);
  process.exit(1);
});

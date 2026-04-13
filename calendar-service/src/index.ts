import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

type CreateEventRequest = {
  action: "create_event";
  event: {
    title: string;
    date: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    description?: string;
    category?: string;
    rawDate?: string;
  };
  source: {
    source: string;
    channelId: string;
    userId: string;
    username: string;
    messageId: string;
    timezone?: string;
  };
};

type SearchEventsRequest = {
  action: "search_events";
  filters: {
    title?: string;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    startTime?: string;
    endTime?: string;
    userId?: string;
    limit?: number;
  };
};

type DeleteEventsRequest = {
  action: "delete_events";
  pageIds: string[];
};

type UpdateEventsRequest = {
  action: "update_events";
  updates: Array<{
    pageId: string;
    event: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      description?: string;
      category?: string;
    };
  }>;
};

type CreateEventResponse = {
  success: boolean;
  reply: string;
};

type CalendarEventSummary = {
  pageId: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  description?: string;
  category?: string;
  userId?: string;
};

type SearchEventsResponse = {
  success: boolean;
  events: CalendarEventSummary[];
  total: number;
};

type DeleteEventsResponse = {
  success: boolean;
  deletedCount: number;
  deletedEvents: CalendarEventSummary[];
  reply: string;
};

type UpdateEventsResponse = {
  success: boolean;
  updatedCount: number;
  updatedEvents: CalendarEventSummary[];
  reply: string;
};

type StoredCalendarEvent = CalendarEventSummary & {
  sourceName?: string;
  sourceChannelId?: string;
  sourceUserId?: string;
  sourceUsername?: string;
  sourceMessageId?: string;
  timezone?: string;
  rawDate?: string;
  deletedAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

type EventDateWindowInput = {
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
};

type CategoryDefinition = {
  name: string;
  aliases: string[];
};

const env = {
  port: Number(process.env.CALENDAR_SERVICE_PORT ?? "8003"),
  postgresUrl:
    process.env.POSTGRES_URL ??
    "postgres://agentpulse:agentpulse_dev_password@postgres:5432/agentpulse",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  appleConnectorUrl:
    process.env.APPLE_CONNECTOR_URL ?? "http://apple-connector:8006",
  googleConnectorUrl:
    process.env.GOOGLE_CONNECTOR_URL ?? "http://google-connector:8007",
  notionConnectorUrl:
    process.env.NOTION_CONNECTOR_URL ?? "http://notion-connector:8008",
  internalApiToken:
    process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "pulse_dashboard_internal_token_change_me"
};

validateEnv();

const pool = new Pool({
  connectionString: env.postgresUrl
});

const controlledCategories: CategoryDefinition[] = [
  {
    name: "Reuniao",
    aliases: [
      "reuniao",
      "reunião",
      "meeting",
      "conferencia",
      "conferência",
      "workshop",
      "seminario",
      "seminário",
      "palestra",
      "apresentacao",
      "apresentação",
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
      "consulta médica",
      "medico",
      "médico",
      "dentista",
      "hospital",
      "terapia",
      "psicologo",
      "psicólogo",
      "exame",
      "fisioterapia"
    ]
  },
  {
    name: "Trabalho",
    aliases: ["trabalho", "trabalhar", "turno", "servico", "serviço", "work", "job"]
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
      "projeto académico",
      "teste",
      "exame"
    ]
  },
  {
    name: "Treino",
    aliases: [
      "treino",
      "ginasio",
      "ginásio",
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
      "férias",
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
      "almoço",
      "pequeno almoco",
      "pequeno almoço",
      "brunch",
      "cafe",
      "café",
      "snack"
    ]
  },
  {
    name: "Aniversario",
    aliases: ["aniversario", "aniversário", "festa de anos", "anos"]
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
        service: "calendar-service",
        storage: "postgres"
      });
    }

    if (method === "POST" && path === "/events") {
      const payload = (await readJsonBody(request)) as CreateEventRequest;
      validateCreateEventPayload(payload);
      const result = await createEvent(payload);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/events/search") {
      const payload = (await readJsonBody(request)) as SearchEventsRequest;
      validateSearchEventsPayload(payload);
      const result = await searchEvents(payload);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/events/delete") {
      const payload = (await readJsonBody(request)) as DeleteEventsRequest;
      validateDeleteEventsPayload(payload);
      const result = await deleteEvents(payload);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/events/update") {
      const payload = (await readJsonBody(request)) as UpdateEventsRequest;
      validateUpdateEventsPayload(payload);
      const result = await updateEvents(payload);
      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/internal/users/purge") {
      if (!isAuthorizedInternalRequest(request)) {
        return sendJson(response, 401, {
          success: false,
          error: "Nao autorizado."
        });
      }

      const payload = (await readJsonBody(request)) as { userId?: string };
      const userId = typeof payload?.userId === "string" ? payload.userId.trim() : "";

      if (!userId) {
        return sendJson(response, 400, {
          success: false,
          error: "userId e obrigatorio."
        });
      }

      const result = await purgeUserEvents(userId);
      return sendJson(response, 200, {
        success: true,
        ...result
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[calendar-service] Erro:", error);
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

async function startServer(): Promise<void> {
  await initializeDatabase();
  server.listen(env.port, () => {
    console.log(
      `[calendar-service] A escutar na porta ${env.port} com PostgreSQL como storage`
    );
  });
}

async function createEvent(payload: CreateEventRequest): Promise<CreateEventResponse> {
  const eventId = randomUUID();
  const storedEvent = await insertStoredEvent(eventId, payload);

  void syncEventToAppleConnector(storedEvent.pageId);
  void syncEventToGoogleConnector(storedEvent.pageId);
  void syncEventToNotionConnector(storedEvent.pageId);

  return {
    success: true,
    reply: buildSuccessReply(storedEvent)
  };
}

async function searchEvents(payload: SearchEventsRequest): Promise<SearchEventsResponse> {
  const events = await searchStoredEvents(payload.filters);

  return {
    success: true,
    events,
    total: events.length
  };
}

async function deleteEvents(payload: DeleteEventsRequest): Promise<DeleteEventsResponse> {
  const events = await getStoredEventsByIds(payload.pageIds);
  const deletedEvents: CalendarEventSummary[] = [];

  for (const event of events) {
    const deleted = await markStoredEventDeleted(event.pageId);
    deletedEvents.push(toCalendarEventSummary(deleted));
    void deleteEventFromAppleConnector(event.pageId);
    void deleteEventFromGoogleConnector(event.pageId);
    void deleteEventFromNotionConnector(event.pageId);
  }

  return {
    success: true,
    deletedCount: deletedEvents.length,
    deletedEvents,
    reply: buildDeleteReply(deletedEvents)
  };
}

async function updateEvents(payload: UpdateEventsRequest): Promise<UpdateEventsResponse> {
  const updatedEvents: CalendarEventSummary[] = [];

  for (const update of payload.updates) {
    const existing = await getStoredEventById(update.pageId);
    if (!existing) {
      continue;
    }

    const mergedEvent = mergeStoredEventWithUpdate(existing, update.event);
    const updated = await updateStoredEvent(existing.pageId, mergedEvent);
    updatedEvents.push(toCalendarEventSummary(updated));
    void syncEventToAppleConnector(updated.pageId);
    void syncEventToGoogleConnector(updated.pageId);
    void syncEventToNotionConnector(updated.pageId);
  }

  return {
    success: true,
    updatedCount: updatedEvents.length,
    updatedEvents,
    reply: buildUpdateReply(updatedEvents)
  };
}

async function purgeUserEvents(userId: string): Promise<{ deletedCount: number }> {
  const events = await searchStoredEvents({
    userId,
    limit: 5000
  });

  for (const event of events) {
    await markStoredEventDeleted(event.pageId);
    void deleteEventFromAppleConnector(event.pageId);
    void deleteEventFromGoogleConnector(event.pageId);
    void deleteEventFromNotionConnector(event.pageId);
  }

  return {
    deletedCount: events.length
  };
}

async function insertStoredEvent(
  eventId: string,
  payload: CreateEventRequest
): Promise<StoredCalendarEvent> {
  const { event, source } = payload;
  const resolvedCategory = resolveCategoryLabel(event.title, event.description, event.category);

  const result = await pool.query(
    `
      INSERT INTO calendar_events (
        id,
        title,
        event_date,
        end_date,
        start_time,
        end_time,
        all_day,
        description,
        category,
        raw_date,
        source_name,
        source_channel_id,
        source_user_id,
        source_username,
        source_message_id,
        timezone
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16
      )
      RETURNING *
    `,
    [
      eventId,
      event.title,
      event.date,
      event.endDate ?? null,
      event.startTime ?? null,
      event.endTime ?? null,
      event.allDay === true,
      event.description ?? null,
      resolvedCategory,
      event.rawDate ?? null,
      source.source,
      source.channelId,
      source.userId,
      source.username,
      source.messageId,
      source.timezone ?? env.timezone
    ]
  );

  return mapStoredEventRow(result.rows[0]);
}

async function searchStoredEvents(
  filters: SearchEventsRequest["filters"]
): Promise<CalendarEventSummary[]> {
  const result = await pool.query(
    `
      SELECT *
      FROM calendar_events
      WHERE deleted_at IS NULL
      ORDER BY event_date ASC, COALESCE(start_time, '00:00') ASC, created_at ASC
    `
  );

  return result.rows
    .map((row) => mapStoredEventRow(row as Record<string, unknown>))
    .filter((event) => matchesSearchFilters(event, filters))
    .slice(0, Math.min(Math.max(filters.limit ?? 20, 1), 100))
    .map(toCalendarEventSummary);
}

async function getStoredEventById(id: string): Promise<StoredCalendarEvent | null> {
  const result = await pool.query(
    `
      SELECT *
      FROM calendar_events
      WHERE deleted_at IS NULL
        AND id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0]
    ? mapStoredEventRow(result.rows[0] as Record<string, unknown>)
    : null;
}

async function getStoredEventsByIds(ids: string[]): Promise<StoredCalendarEvent[]> {
  if (ids.length === 0) {
    return [];
  }

  const result = await pool.query(
    `
      SELECT *
      FROM calendar_events
      WHERE deleted_at IS NULL
        AND id = ANY($1::text[])
    `,
    [ids]
  );

  const byInputOrder = new Map(ids.map((id, index) => [id, index]));

  return result.rows
    .map((row) => mapStoredEventRow(row as Record<string, unknown>))
    .sort(
      (a, b) =>
        (byInputOrder.get(a.pageId) ?? Number.MAX_SAFE_INTEGER) -
        (byInputOrder.get(b.pageId) ?? Number.MAX_SAFE_INTEGER)
    );
}

async function markStoredEventDeleted(id: string): Promise<StoredCalendarEvent> {
  const result = await pool.query(
    `
      UPDATE calendar_events
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [id]
  );

  return mapStoredEventRow(result.rows[0] as Record<string, unknown>);
}

async function updateStoredEvent(
  id: string,
  event: UpdateEventsRequest["updates"][number]["event"]
): Promise<StoredCalendarEvent> {
  const resolvedCategory = resolveCategoryLabel(event.title, event.description, event.category);

  const result = await pool.query(
    `
      UPDATE calendar_events
      SET
        title = $2,
        event_date = $3,
        start_time = $4,
        end_time = $5,
        all_day = FALSE,
        description = $6,
        category = $7,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      id,
      event.title,
      event.date,
      event.startTime,
      event.endTime,
      event.description ?? null,
      resolvedCategory
    ]
  );

  return mapStoredEventRow(result.rows[0] as Record<string, unknown>);
}

function mergeStoredEventWithUpdate(
  existing: StoredCalendarEvent,
  event: UpdateEventsRequest["updates"][number]["event"]
): UpdateEventsRequest["updates"][number]["event"] {
  return {
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    description: event.description,
    category: event.category ?? existing.category
  };
}

function mapStoredEventRow(row: Record<string, unknown>): StoredCalendarEvent {
  return {
    pageId: String(row.id),
    title: String(row.title),
    date: coerceDateOnlyString(row.event_date) ?? String(row.event_date),
    endDate: coerceDateOnlyString(row.end_date),
    startTime: coerceTimeString(row.start_time),
    endTime: coerceTimeString(row.end_time),
    allDay: row.all_day === true,
    description: typeof row.description === "string" ? row.description : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    userId: typeof row.source_user_id === "string" ? row.source_user_id : undefined,
    sourceName: typeof row.source_name === "string" ? row.source_name : undefined,
    sourceChannelId:
      typeof row.source_channel_id === "string" ? row.source_channel_id : undefined,
    sourceUserId: typeof row.source_user_id === "string" ? row.source_user_id : undefined,
    sourceUsername:
      typeof row.source_username === "string" ? row.source_username : undefined,
    sourceMessageId:
      typeof row.source_message_id === "string" ? row.source_message_id : undefined,
    timezone: typeof row.timezone === "string" ? row.timezone : undefined,
    rawDate: typeof row.raw_date === "string" ? row.raw_date : undefined,
    deletedAt: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : undefined,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : undefined
  };
}

function toCalendarEventSummary(event: StoredCalendarEvent): CalendarEventSummary {
  return {
    pageId: event.pageId,
    title: event.title,
    date: event.date,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    description: event.description,
    category: event.category,
    userId: event.sourceUserId ?? event.userId
  };
}

function matchesSearchFilters(
  event: StoredCalendarEvent,
  filters: SearchEventsRequest["filters"]
): boolean {
  if (filters.userId && event.sourceUserId && event.sourceUserId !== filters.userId) {
    return false;
  }

  if (filters.userId && !event.sourceUserId) {
    return false;
  }

  if (!eventMatchesDateFilters(event, filters)) {
    return false;
  }

  const normalizedStartTime = normalizeClockTime(filters.startTime);
  if (normalizedStartTime && event.startTime !== normalizedStartTime) {
    return false;
  }

  const normalizedEndTime = normalizeClockTime(filters.endTime);
  if (normalizedEndTime && event.endTime !== normalizedEndTime) {
    return false;
  }

  if (filters.title) {
    const wanted = normalizeLooseText(filters.title);
    const haystacks = [event.title, event.description ?? "", event.category ?? ""]
      .map((value) => normalizeLooseText(value))
      .filter((value) => value.length > 0);
    const hasMatch = haystacks.some(
      (value) => value === wanted || value.includes(wanted) || wanted.includes(value)
    );
    if (!hasMatch) {
      return false;
    }
  }

  return true;
}

function eventMatchesDateFilters(
  event: StoredCalendarEvent,
  filters: SearchEventsRequest["filters"]
): boolean {
  const eventStart = event.date;
  const eventEnd = event.endDate ?? event.date;

  if (filters.date && (filters.date < eventStart || filters.date > eventEnd)) {
    return false;
  }

  if (filters.dateFrom && eventEnd < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && eventStart > filters.dateTo) {
    return false;
  }

  return true;
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
    if (
      definition.aliases.some((alias) => normalized.includes(normalizeLooseText(alias)))
    ) {
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

      return `${word.charAt(0).toLocaleUpperCase("pt-PT")}${word
        .slice(1)
        .toLocaleLowerCase("pt-PT")}`;
    })
    .join(" ");
}

function isGenericCategoryLabel(value: string): boolean {
  const normalized = normalizeLooseText(value);
  return (
    normalized.length === 0 ||
    [
      "categoria",
      "evento",
      "agenda",
      "outro",
      "outros",
      "geral",
      "misc",
      "sem categoria"
    ].includes(normalized)
  );
}

function buildSuccessReply(event: EventDateWindowInput): string {
  return buildEventSuccessReply("Registei", event);
}

function buildEventSuccessReply(
  verb: "Registei" | "Atualizei",
  event: EventDateWindowInput
): string {
  const dateLabel = formatDateWindowLabel(event.date, event.endDate);
  if (event.allDay || (!event.startTime && !event.endTime)) {
    const preposition =
      event.endDate && event.endDate !== event.date ? "de" : "para";
    return `Perfeito. ${verb} ${event.title} na agenda ${preposition} ${dateLabel}, dia todo.`;
  }

  return `Perfeito. ${verb} ${event.title} na agenda para ${formatFriendlyDate(
    event.date
  )}, das ${event.startTime ?? "--:--"} as ${event.endTime ?? "--:--"}.`;
}

function buildEventSummaryReply(
  verb: "Registei" | "Atualizei",
  event: CalendarEventSummary
): string {
  return buildEventSuccessReply(verb, event);
}

function buildDeleteReply(events: CalendarEventSummary[]): string {
  if (events.length === 0) {
    return "Nao consegui apagar nenhum evento.";
  }

  if (events.length === 1) {
    return `Perfeito. Apaguei ${formatEventLabel(events[0])}.`;
  }

  return `Perfeito. Apaguei ${events.length} eventos.`;
}

function buildUpdateReply(events: CalendarEventSummary[]): string {
  if (events.length === 0) {
    return "Nao consegui atualizar nenhum evento.";
  }

  if (events.length === 1) {
    return buildEventSummaryReply("Atualizei", events[0]);
  }

  return [
    `Perfeito. Atualizei ${events.length} eventos na agenda:`,
    ...events.map((event, index) => `${index + 1}. ${formatEventLabel(event)}`)
  ].join("\n");
}

function formatEventLabel(event: CalendarEventSummary): string {
  const date = formatDateWindowLabel(event.date, event.endDate);
  if (event.allDay && event.endDate) {
    return `${event.title} de ${date}, dia todo`;
  }
  if (event.startTime && event.endTime) {
    return `${event.title} de ${date}, das ${event.startTime} as ${event.endTime}`;
  }
  if (event.startTime) {
    return `${event.title} de ${date}, as ${event.startTime}`;
  }

  return event.allDay ? `${event.title} de ${date}, dia todo` : `${event.title} de ${date}`;
}

function formatFriendlyDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDateWindowLabel(startDate: string, endDate?: string): string {
  if (endDate && endDate !== startDate) {
    return `${formatFriendlyDate(startDate)} a ${formatFriendlyDate(endDate)}`;
  }

  return formatFriendlyDate(startDate);
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
    throw new Error("Body JSON invalido.");
  }
}

function validateSearchEventsPayload(
  payload: unknown
): asserts payload is SearchEventsRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;
  if (record.action !== "search_events") {
    throw new Error("Apenas a acao 'search_events' e suportada neste endpoint.");
  }

  if (!record.filters || typeof record.filters !== "object") {
    throw new Error("Campo 'filters' em falta.");
  }

  const filters = record.filters as Record<string, unknown>;
  if (filters.date !== undefined && normalizeDateValue(filters.date) === null) {
    throw new Error("Campo invalido em filters: date");
  }
  if (filters.dateFrom !== undefined && normalizeDateValue(filters.dateFrom) === null) {
    throw new Error("Campo invalido em filters: dateFrom");
  }
  if (filters.dateTo !== undefined && normalizeDateValue(filters.dateTo) === null) {
    throw new Error("Campo invalido em filters: dateTo");
  }
  if (filters.startTime !== undefined && normalizeClockTime(filters.startTime) === null) {
    throw new Error("Campo invalido em filters: startTime");
  }
  if (filters.endTime !== undefined && normalizeClockTime(filters.endTime) === null) {
    throw new Error("Campo invalido em filters: endTime");
  }
  if (filters.limit !== undefined && (!Number.isInteger(filters.limit) || Number(filters.limit) < 1)) {
    throw new Error("Campo invalido em filters: limit");
  }
}

function validateDeleteEventsPayload(
  payload: unknown
): asserts payload is DeleteEventsRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;
  if (record.action !== "delete_events") {
    throw new Error("Apenas a acao 'delete_events' e suportada neste endpoint.");
  }

  if (!Array.isArray(record.pageIds) || record.pageIds.length === 0) {
    throw new Error("Campo 'pageIds' em falta.");
  }

  if (record.pageIds.some((pageId) => typeof pageId !== "string" || pageId.trim().length === 0)) {
    throw new Error("Campo invalido em pageIds.");
  }
}

function validateUpdateEventsPayload(
  payload: unknown
): asserts payload is UpdateEventsRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;
  if (record.action !== "update_events") {
    throw new Error("Apenas a acao 'update_events' e suportada neste endpoint.");
  }

  if (!Array.isArray(record.updates) || record.updates.length === 0) {
    throw new Error("Campo 'updates' em falta.");
  }

  for (const update of record.updates) {
    if (!update || typeof update !== "object") {
      throw new Error("Update invalido.");
    }

    const updateRecord = update as Record<string, unknown>;
    if (typeof updateRecord.pageId !== "string" || updateRecord.pageId.trim().length === 0) {
      throw new Error("Campo obrigatorio em falta em updates: pageId");
    }

    if (!updateRecord.event || typeof updateRecord.event !== "object") {
      throw new Error("Campo obrigatorio em falta em updates: event");
    }

    const event = updateRecord.event as Record<string, unknown>;
    for (const field of ["title", "date", "startTime", "endTime"] as const) {
      if (typeof event[field] !== "string" || event[field].trim().length === 0) {
        throw new Error(`Campo obrigatorio em falta em event: ${field}`);
      }
    }

    const normalizedDate = normalizeDateValue(event.date);
    if (!normalizedDate) {
      throw new Error("Campo invalido em event: date");
    }

    const normalizedStartTime = normalizeClockTime(event.startTime);
    if (!normalizedStartTime) {
      throw new Error("Campo invalido em event: startTime");
    }

    const normalizedEndTime = normalizeClockTime(event.endTime);
    if (!normalizedEndTime) {
      throw new Error("Campo invalido em event: endTime");
    }

    event.date = normalizedDate;
    event.startTime = normalizedStartTime;
    event.endTime = normalizedEndTime;
  }
}

function validateCreateEventPayload(
  payload: unknown
): asserts payload is CreateEventRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;

  if (record.action !== "create_event") {
    throw new Error("Apenas a acao 'create_event' e suportada nesta fase.");
  }

  if (!record.event || typeof record.event !== "object") {
    throw new Error("Campo 'event' em falta.");
  }

  if (!record.source || typeof record.source !== "object") {
    throw new Error("Campo 'source' em falta.");
  }

  const event = record.event as Record<string, unknown>;
  const source = record.source as Record<string, unknown>;

  for (const field of ["title", "date"] as const) {
    if (typeof event[field] !== "string" || event[field].trim().length === 0) {
      throw new Error(`Campo obrigatorio em falta em event: ${field}`);
    }
  }

  const normalizedDate = normalizeDateValue(event.date);
  if (!normalizedDate) {
    throw new Error("Campo invalido em event: date");
  }

  event.date = normalizedDate;

  const normalizedEndDate =
    typeof event.endDate === "string" ? normalizeDateValue(event.endDate) : null;
  const allDay = event.allDay === true || Boolean(normalizedEndDate);

  if (allDay) {
    if (typeof event.endDate === "string" && !normalizedEndDate) {
      throw new Error("Campo invalido em event: endDate");
    }
    if (normalizedEndDate) {
      if (normalizedEndDate < normalizedDate) {
        throw new Error("Campo invalido em event: endDate");
      }
      event.endDate = normalizedEndDate;
    }
    event.allDay = true;
    delete event.startTime;
    delete event.endTime;
  } else {
    const normalizedStartTime = normalizeClockTime(event.startTime);
    if (!normalizedStartTime) {
      throw new Error("Campo invalido em event: startTime");
    }

    const normalizedEndTime = normalizeClockTime(event.endTime);
    if (!normalizedEndTime) {
      throw new Error("Campo invalido em event: endTime");
    }

    event.startTime = normalizedStartTime;
    event.endTime = normalizedEndTime;
  }

  for (const field of ["source", "channelId", "userId", "username", "messageId"] as const) {
    if (typeof source[field] !== "string" || source[field].trim().length === 0) {
      throw new Error(`Campo obrigatorio em falta em source: ${field}`);
    }
  }
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

function isAuthorizedInternalRequest(request: IncomingMessage): boolean {
  const providedToken = request.headers["x-internal-token"];
  const token = Array.isArray(providedToken) ? providedToken[0] : providedToken;
  return Boolean(token && token === env.internalApiToken);
}

function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    Number.isNaN(second) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDateValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/u);
  if (!match) {
    return null;
  }

  const dateOnly = match[1];
  const parsed = new Date(`${dateOnly}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10) === dateOnly ? dateOnly : null;
}

function coerceDateOnlyString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeDateValue(value) ?? value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return undefined;
}

function coerceTimeString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return normalizeClockTime(value) ?? undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(
      value.getUTCMinutes()
    ).padStart(2, "0")}`;
  }

  return undefined;
}

function normalizeLooseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      event_date DATE NOT NULL,
      end_date DATE NULL,
      start_time TIME NULL,
      end_time TIME NULL,
      all_day BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT NULL,
      category TEXT NULL,
      raw_date TEXT NULL,
      source_name TEXT NULL,
      source_channel_id TEXT NULL,
      source_user_id TEXT NULL,
      source_username TEXT NULL,
      source_message_id TEXT NULL,
      timezone TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date
    ON calendar_events (source_user_id, event_date, start_time)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_events_active_date
    ON calendar_events (event_date, start_time)
    WHERE deleted_at IS NULL
  `);
}

async function syncEventToAppleConnector(eventId: string): Promise<void> {
  await notifyAppleConnector("/providers/apple/events/sync", eventId);
}

async function syncEventToGoogleConnector(eventId: string): Promise<void> {
  await notifyGoogleConnector("/providers/google/events/sync", eventId);
}

async function syncEventToNotionConnector(eventId: string): Promise<void> {
  await notifyNotionConnector("/providers/notion/events/sync", eventId);
}

async function deleteEventFromAppleConnector(eventId: string): Promise<void> {
  await notifyAppleConnector("/providers/apple/events/delete", eventId);
}

async function deleteEventFromGoogleConnector(eventId: string): Promise<void> {
  await notifyGoogleConnector("/providers/google/events/delete", eventId);
}

async function deleteEventFromNotionConnector(eventId: string): Promise<void> {
  await notifyNotionConnector("/providers/notion/events/delete", eventId);
}

async function notifyAppleConnector(path: string, eventId: string): Promise<void> {
  try {
    const response = await fetch(`${env.appleConnectorUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-internal-token": env.internalApiToken
      },
      body: JSON.stringify({ eventId })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `[calendar-service] Não consegui notificar o apple-connector para o evento ${eventId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function notifyGoogleConnector(path: string, eventId: string): Promise<void> {
  try {
    const response = await fetch(`${env.googleConnectorUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-internal-token": env.internalApiToken
      },
      body: JSON.stringify({ eventId })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `[calendar-service] Não consegui notificar o google-connector para o evento ${eventId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function notifyNotionConnector(path: string, eventId: string): Promise<void> {
  try {
    const response = await fetch(`${env.notionConnectorUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-internal-token": env.internalApiToken
      },
      body: JSON.stringify({ eventId })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(
      `[calendar-service] Não consegui notificar o notion-connector para o evento ${eventId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function validateEnv(): void {
  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("CALENDAR_SERVICE_PORT deve ser um numero valido.");
  }

  if (!env.postgresUrl) {
    throw new Error("POSTGRES_URL e obrigatoria.");
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[calendar-service] A terminar (${signal})...`);
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void startServer().catch((error) => {
  console.error("[calendar-service] Falha ao arrancar:", error);
  process.exit(1);
});


import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import ical from "node-ical";
import { type Pool } from "pg";
import { createDAVClient, type DAVCalendar, type DAVCalendarObject } from "tsdav";

export type LocalCalendarEvent = {
  pageId: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  description?: string;
  category?: string;
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

type AppleCalendarConnectionRow = {
  id: string;
  user_id: string | null;
  enabled: boolean;
  account_email: string | null;
  app_specific_password_encrypted: string | null;
  selected_calendar_id: string | null;
  selected_calendar_name: string | null;
  discovered_calendars_json: string | null;
  sync_mode: string;
  last_tested_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
};

type AppleConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string;
  appSpecificPassword: string;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  syncMode: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type AppleProviderLink = {
  id: string;
  eventId: string;
  remoteId: string;
  remoteUid: string | null;
  remoteEtag: string | null;
  remoteCalendarId: string | null;
  remoteCalendarName: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type DashboardRuntimeLink = {
  linkedDiscordUserId: string | null;
  linkedDiscordUsername: string | null;
  conversationChannelId: string | null;
};

type AppleRemoteEvent = {
  remoteId: string;
  remoteUid: string | null;
  remoteEtag: string | null;
  remoteCalendarId: string;
  remoteCalendarName: string;
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  timezone: string;
  calendarObject: DAVCalendarObject;
};

export type AppleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
};

export type AppleConnectionTestResult = {
  calendars: AppleCalendarOption[];
  defaultCalendar: AppleCalendarOption;
};

export type AppleSyncSummary = {
  success: boolean;
  importedLocal: number;
  updatedLocal: number;
  deletedLocal: number;
  createdRemote: number;
  updatedRemote: number;
  deletedRemote: number;
  skipped: number;
  message: string;
  lastError: string | null;
};

export type AppleSyncDependencies = {
  eventPool: Pool;
  configPool: Pool;
  timezone: string;
  configEncryptionKey: string;
  serverUrl: string;
  logger?: Pick<Console, "log" | "warn" | "error">;
  resolveCategoryLabel: (title: string, description?: string, explicitCategory?: string) => string;
  notifyGoogleEventSync?: (eventId: string) => Promise<void>;
  notifyGoogleEventDelete?: (eventId: string) => Promise<void>;
  notifyNotionEventSync?: (eventId: string) => Promise<void>;
  notifyNotionEventDelete?: (eventId: string) => Promise<void>;
};

const APPLE_PROVIDER = "apple";
const DEFAULT_APPLE_CALDAV_URL = "https://caldav.icloud.com";
const calendarCreationLocks = new Map<string, Promise<DAVCalendar>>();

export async function ensureAppleSyncSchema(
  deps: Pick<AppleSyncDependencies, "eventPool" | "configPool">
): Promise<void> {
  await deps.eventPool.query(`
    CREATE TABLE IF NOT EXISTS calendar_provider_links (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      remote_uid TEXT NULL,
      remote_etag TEXT NULL,
      remote_calendar_id TEXT NULL,
      remote_calendar_name TEXT NULL,
      last_synced_at TIMESTAMPTZ NULL,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await deps.eventPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_provider_links_provider_event
    ON calendar_provider_links (provider, event_id)
  `);

  await deps.eventPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_provider_links_provider_remote
    ON calendar_provider_links (provider, remote_id)
  `);

  await deps.eventPool.query(`
    CREATE INDEX IF NOT EXISTS idx_calendar_provider_links_provider_uid
    ON calendar_provider_links (provider, remote_uid)
  `);

  await deps.configPool.query(`
    CREATE TABLE IF NOT EXISTS apple_calendar_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      account_email TEXT NULL,
      app_specific_password_encrypted TEXT NULL,
      selected_calendar_id TEXT NULL,
      selected_calendar_name TEXT NULL,
      discovered_calendars_json TEXT NULL,
      sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      last_tested_at TIMESTAMPTZ NULL,
      last_sync_at TIMESTAMPTZ NULL,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await deps.configPool.query(`
    ALTER TABLE apple_calendar_connections
      ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS selected_calendar_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS discovered_calendars_json TEXT NULL,
      ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_error TEXT NULL
  `);

  await deps.configPool.query(`
    CREATE INDEX IF NOT EXISTS idx_apple_calendar_connections_user
    ON apple_calendar_connections (user_id)
  `);
}

export async function testAppleConnection(
  deps: Pick<AppleSyncDependencies, "serverUrl" | "logger">,
  input: {
    accountEmail: string;
    appSpecificPassword: string;
  }
): Promise<AppleConnectionTestResult> {
  const client = await createAppleDavClient(
    deps.serverUrl,
    input.accountEmail,
    input.appSpecificPassword
  );
  const ensured = await ensureDefaultAppleCalendar(client);
  const calendars = ensured.calendars;

  deps.logger?.log?.(
    `[calendar-service] Apple test: encontrados ${calendars.length} calendários.`
  );

  return {
    calendars: calendars.map(toAppleCalendarOption),
    defaultCalendar: toAppleCalendarOption(ensured.defaultCalendar)
  };
}

async function createAppleDavClient(
  serverUrl: string,
  accountEmail: string,
  appSpecificPassword: string
) {
  return createDAVClient({
    serverUrl: serverUrl || DEFAULT_APPLE_CALDAV_URL,
    credentials: {
      username: accountEmail,
      password: appSpecificPassword
    },
    authMethod: "Basic",
    defaultAccountType: "caldav"
  });
}

function toAppleCalendarOption(calendar: DAVCalendar): AppleCalendarOption {
  const displayName = extractCalendarDisplayName(calendar.displayName);
  return {
    id: calendar.url,
    name: displayName || "Calendário sem nome",
    description: typeof calendar.description === "string" ? calendar.description : null,
    timezone: typeof calendar.timezone === "string" ? calendar.timezone : null
  };
}

function extractCalendarDisplayName(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const val = (value as { value?: unknown; val?: unknown }).value ?? (value as { val?: unknown }).val;
    if (typeof val === "string") {
      return val.trim();
    }
  }

  return "";
}

async function getEnabledAppleConnection(
  deps: Pick<AppleSyncDependencies, "configPool" | "configEncryptionKey">,
  input?: { userId?: string }
): Promise<AppleConnection | null> {
  const result = await deps.configPool.query<AppleCalendarConnectionRow>(
    `
      SELECT *
      FROM apple_calendar_connections
      WHERE ($1::text IS NULL OR user_id = $1)
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [input?.userId ?? null]
  );

  const row = result.rows[0];
  if (!row || !row.enabled || !row.account_email) {
    return null;
  }

  if (!row.app_specific_password_encrypted) {
    return null;
  }

  if (!deps.configEncryptionKey) {
    throw new Error("CONFIG_ENCRYPTION_KEY não está definida para ler a configuração Apple.");
  }

  return {
    id: row.id,
    userId: row.user_id ?? "",
    enabled: row.enabled,
    accountEmail: row.account_email,
    appSpecificPassword: decryptSecret(row.app_specific_password_encrypted, deps.configEncryptionKey),
    defaultCalendarId: row.selected_calendar_id,
    defaultCalendarName: row.selected_calendar_name,
    syncMode: row.sync_mode || "bidirectional",
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    lastError: row.last_error
  };
}

async function getEnabledAppleConnectionForDiscordUser(
  deps: Pick<AppleSyncDependencies, "configPool" | "configEncryptionKey">,
  discordUserId: string
): Promise<AppleConnection | null> {
  const result = await deps.configPool.query<AppleCalendarConnectionRow>(
    `
      SELECT ac.*
      FROM apple_calendar_connections ac
      JOIN dashboard_runtime_settings drs
        ON drs.user_id = ac.user_id
      WHERE ac.enabled = TRUE
        AND ac.account_email IS NOT NULL
        AND ac.app_specific_password_encrypted IS NOT NULL
        AND drs.linked_discord_user_id = $1
      ORDER BY ac.updated_at DESC
      LIMIT 1
    `,
    [discordUserId]
  );

  const row = result.rows[0];
  if (!row || !row.user_id) {
    return null;
  }

  return getEnabledAppleConnection(deps, { userId: row.user_id });
}

async function listEnabledAppleConnectionUserIds(configPool: Pool): Promise<string[]> {
  const result = await configPool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM apple_calendar_connections
      WHERE enabled = TRUE
        AND user_id IS NOT NULL
      ORDER BY updated_at DESC
    `
  );

  return [...new Set(result.rows.map((row) => row.user_id).filter(Boolean))];
}

function normalizeLooseText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function isReminderCalendarName(name: string | null | undefined): boolean {
  const normalized = normalizeLooseText(name);
  return normalized === "lembretes" || normalized === "reminders" || normalized === "reminder";
}

function isHolidayCalendarName(name: string | null | undefined): boolean {
  const normalized = normalizeLooseText(name);
  return (
    normalized === "feriados" ||
    normalized === "feriados em portugal" ||
    normalized === "holidays" ||
    normalized === "holiday" ||
    normalized.includes("feriados") ||
    normalized.includes("holidays")
  );
}

function isEmailLikeCalendarName(name: string | null | undefined): boolean {
  const value = (name ?? "").trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(value);
}

function isExcludedAutomaticCalendarName(name: string | null | undefined): boolean {
  return (
    isReminderCalendarName(name) ||
    isHolidayCalendarName(name) ||
    isEmailLikeCalendarName(name)
  );
}

function getCalendarName(calendar: DAVCalendar): string {
  return toAppleCalendarOption(calendar).name;
}

function findCalendarByIdOrName(
  calendars: DAVCalendar[],
  calendarId: string | null | undefined,
  calendarName: string | null | undefined
): DAVCalendar | null {
  return (
    calendars.find((calendar) => calendarId && calendar.url === calendarId) ??
    calendars.find(
      (calendar) =>
        calendarName &&
        normalizeLooseText(getCalendarName(calendar)) === normalizeLooseText(calendarName)
    ) ??
    null
  );
}

function buildCalendarSlug(name: string): string {
  const base = normalizeLooseText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `${base || "pulse"}-${randomUUID().slice(0, 8)}`;
}

function getAppleCalendarColor(name: string): string {
  switch (normalizeLooseText(name)) {
    case "reuniao":
      return "#0A84FF";
    case "consulta":
      return "#FF453A";
    case "estudo":
      return "#5E5CE6";
    case "treino":
      return "#30D158";
    case "viagem":
      return "#FF9F0A";
    case "jantar":
      return "#FFD60A";
    case "lanche":
      return "#64D2FF";
    case "outros":
    case "other":
      return "#8E8E93";
    default:
      return "#BF5AF2";
  }
}

function getCalendarCollectionBaseUrl(calendars: DAVCalendar[]): string {
  const referenceUrl = calendars[0]?.url;
  if (!referenceUrl) {
    throw new Error("A conta Apple nao devolveu nenhum calendario base para criar novos.");
  }

  return new URL("../", referenceUrl).href;
}

async function createAppleCalendar(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendars: DAVCalendar[],
  name: string
): Promise<DAVCalendar> {
  const baseUrl = getCalendarCollectionBaseUrl(calendars);
  const targetUrl = new URL(`${buildCalendarSlug(name)}/`, baseUrl).href;

  await client.makeCalendar({
    url: targetUrl,
    props: {
      "d:displayname": {
        _text: name
      },
      "c:calendar-description": {
        _text: `Pulse - ${name}`
      },
      "c:supported-calendar-component-set": {
        "c:comp": {
          _attributes: {
            name: "VEVENT"
          }
        }
      },
      "ca:calendar-color": {
        _text: getAppleCalendarColor(name)
      }
    }
  });

  const refreshedCalendars = await client.fetchCalendars();
  const created =
    refreshedCalendars.find((calendar) => calendar.url === targetUrl) ??
    refreshedCalendars.find(
      (calendar) => normalizeLooseText(getCalendarName(calendar)) === normalizeLooseText(name)
    );

  if (!created) {
    throw new Error(`O calendario Apple "${name}" foi criado mas nao apareceu na listagem seguinte.`);
  }

  return created;
}

function getPreferredMappedCalendarName(
  categoryOrCalendarName: string | null | undefined,
  calendars: DAVCalendar[],
  fallbackName: string
): string | null {
  const normalized = normalizeLooseText(categoryOrCalendarName);

  if (!normalized) {
    return null;
  }

  const preferredByCategory: Record<string, string> = {
    trabalho: "Emprego",
    aniversario: "Casa"
  };

  const preferredName = preferredByCategory[normalized];
  if (!preferredName) {
    return null;
  }

  const existingPreferred = calendars.find(
    (calendar) =>
      !isExcludedAutomaticCalendarName(getCalendarName(calendar)) &&
      normalizeLooseText(getCalendarName(calendar)) === normalizeLooseText(preferredName)
  );

  if (existingPreferred) {
    return getCalendarName(existingPreferred);
  }

  return fallbackName;
}

async function ensureNamedAppleCalendar(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendars: DAVCalendar[],
  name: string
): Promise<DAVCalendar> {
  const normalizedName = normalizeLooseText(name);
  const existing = calendars.find(
    (calendar) =>
      !isExcludedAutomaticCalendarName(getCalendarName(calendar)) &&
      normalizeLooseText(getCalendarName(calendar)) === normalizedName
  );
  if (existing) {
    return existing;
  }

  const lockKey = normalizedName || name;
  const inFlight = calendarCreationLocks.get(lockKey);
  if (inFlight) {
    return inFlight;
  }

  const creationPromise = (async () => {
    const latestCalendars = await client.fetchCalendars();
    const existingLatest = latestCalendars.find(
      (calendar) =>
        !isExcludedAutomaticCalendarName(getCalendarName(calendar)) &&
        normalizeLooseText(getCalendarName(calendar)) === normalizedName
    );

    if (existingLatest) {
      return existingLatest;
    }

    return createAppleCalendar(client, latestCalendars, name);
  })();

  calendarCreationLocks.set(lockKey, creationPromise);

  try {
    return await creationPromise;
  } finally {
    calendarCreationLocks.delete(lockKey);
  }
}

function pickExistingAutoDefaultCalendar(calendars: DAVCalendar[]): DAVCalendar | null {
  const preferredNames = ["outros", "other"];

  for (const name of preferredNames) {
    const matching = calendars.find(
      (calendar) =>
        !isExcludedAutomaticCalendarName(getCalendarName(calendar)) &&
        normalizeLooseText(getCalendarName(calendar)) === name
    );
    if (matching) {
      return matching;
    }
  }

  return null;
}

async function ensureDefaultAppleCalendar(
  client: Awaited<ReturnType<typeof createAppleDavClient>>
): Promise<{ defaultCalendar: DAVCalendar; calendars: DAVCalendar[] }> {
  const calendars = await client.fetchCalendars();
  const existing = pickExistingAutoDefaultCalendar(calendars);

  if (existing) {
    return {
      defaultCalendar: existing,
      calendars
    };
  }

  const created = await ensureNamedAppleCalendar(client, calendars, "Outros");
  return {
    defaultCalendar: created,
    calendars: await client.fetchCalendars()
  };
}

async function resolveDefaultCalendar(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  connection: AppleConnection,
  existingCalendars?: DAVCalendar[]
): Promise<{ calendar: DAVCalendar; calendars: DAVCalendar[] }> {
  const calendars = existingCalendars ?? (await client.fetchCalendars());
  const preferred = findCalendarByIdOrName(
    calendars,
    connection.defaultCalendarId,
    connection.defaultCalendarName
  );

  if (preferred && !isReminderCalendarName(getCalendarName(preferred))) {
    if (!isExcludedAutomaticCalendarName(getCalendarName(preferred))) {
      return { calendar: preferred, calendars };
    }
  }

  const ensured = await ensureDefaultAppleCalendar(client);
  return { calendar: ensured.defaultCalendar, calendars: ensured.calendars };
}

function getDesiredCalendarName(
  event: LocalCalendarEvent,
  fallbackName: string,
  calendars: DAVCalendar[]
): string {
  const category = normalizeLooseText(event.category);

  if (
    !category ||
    category === "outros" ||
    category === "outro" ||
    isExcludedAutomaticCalendarName(category)
  ) {
    return fallbackName;
  }

  const mappedName = getPreferredMappedCalendarName(event.category, calendars, fallbackName);
  if (mappedName) {
    return mappedName;
  }

  return event.category?.trim() || fallbackName;
}

async function resolveTargetCalendarForEvent(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  connection: AppleConnection,
  event: LocalCalendarEvent,
  existingCalendars?: DAVCalendar[]
): Promise<{ calendar: DAVCalendar; calendars: DAVCalendar[] }> {
  const fallback = await resolveDefaultCalendar(client, connection, existingCalendars);
  const desiredName = getDesiredCalendarName(
    event,
    getCalendarName(fallback.calendar),
    fallback.calendars
  );

  if (normalizeLooseText(desiredName) === normalizeLooseText(getCalendarName(fallback.calendar))) {
    return fallback;
  }

  const matching = fallback.calendars.find(
    (calendar) =>
      !isExcludedAutomaticCalendarName(getCalendarName(calendar)) &&
      normalizeLooseText(getCalendarName(calendar)) === normalizeLooseText(desiredName)
  );

  if (matching) {
    return { calendar: matching, calendars: fallback.calendars };
  }

  const created = await ensureNamedAppleCalendar(client, fallback.calendars, desiredName);
  return { calendar: created, calendars: await client.fetchCalendars() };
}

function getManagedCalendars(calendars: DAVCalendar[]): DAVCalendar[] {
  return calendars.filter((calendar) => !isExcludedAutomaticCalendarName(getCalendarName(calendar)));
}

function isPulseManagedCalendar(calendar: DAVCalendar): boolean {
  const description = typeof calendar.description === "string" ? calendar.description : "";
  return normalizeLooseText(description).startsWith("pulse");
}

async function deleteCalendarCollection(
  serverUrl: string,
  accountEmail: string,
  appSpecificPassword: string,
  calendarUrl: string
): Promise<void> {
  const credentials = Buffer.from(`${accountEmail}:${appSpecificPassword}`, "utf-8").toString("base64");
  const response = await fetch(calendarUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${credentials}`
    }
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }
}

export async function cleanupAutoCreatedHolidayCalendars(
  deps: Pick<
    AppleSyncDependencies,
    "eventPool" | "configPool" | "configEncryptionKey" | "serverUrl" | "logger"
  >
): Promise<{ deletedCount: number; deletedNames: string[] }> {
  const connection = await getEnabledAppleConnection(deps);
  if (!connection) {
    return { deletedCount: 0, deletedNames: [] };
  }

  const client = await createAppleDavClient(
    deps.serverUrl,
    connection.accountEmail,
    connection.appSpecificPassword
  );
  const calendars = await client.fetchCalendars();
  const defaultResolved = await ensureDefaultAppleCalendar(client);
  const pulseManagedCalendars = calendars.filter((calendar) => isPulseManagedCalendar(calendar));
  const calendarsToDelete = new Map<string, DAVCalendar>();

  for (const calendar of pulseManagedCalendars) {
    const name = getCalendarName(calendar);
    if (isHolidayCalendarName(name) || isEmailLikeCalendarName(name)) {
      calendarsToDelete.set(calendar.url, calendar);
    }
  }

  for (const calendar of pulseManagedCalendars) {
    const sourceName = getCalendarName(calendar);
    const mappedTargetName = getPreferredMappedCalendarName(
      sourceName,
      calendars,
      getCalendarName(defaultResolved.defaultCalendar)
    );

    if (
      !mappedTargetName ||
      normalizeLooseText(mappedTargetName) === normalizeLooseText(sourceName)
    ) {
      continue;
    }

    const targetCalendar =
      calendars.find(
        (entry) =>
          !isExcludedAutomaticCalendarName(getCalendarName(entry)) &&
          normalizeLooseText(getCalendarName(entry)) === normalizeLooseText(mappedTargetName)
      ) ?? defaultResolved.defaultCalendar;

    const targetObjects = await client.fetchCalendarObjects({ calendar: targetCalendar });
    const targetKeys = new Set(
      targetObjects.map((object) => buildCalendarObjectKey(object)).filter(Boolean)
    );
    const sourceObjects = await client.fetchCalendarObjects({ calendar });

    for (const object of sourceObjects) {
      const objectKey = buildCalendarObjectKey(object);
      if (objectKey && targetKeys.has(objectKey)) {
        const existingTargetObject = findMatchingCalendarObjectByKey(targetObjects, objectKey);
        await updateAppleLinkAfterRemoteMove(deps.eventPool, {
          previousRemoteId: object.url,
          nextRemoteId: existingTargetObject?.url ?? object.url,
          remoteUid: extractRemoteUidFromIcs(existingTargetObject?.data ?? object.data),
          remoteEtag: existingTargetObject?.etag ?? object.etag ?? null,
          remoteCalendarId: targetCalendar.url,
          remoteCalendarName: getCalendarName(targetCalendar)
        });
        continue;
      }

      const moved = await copyCalendarObjectToCalendar(client, targetCalendar, object);
      if (objectKey) {
        targetKeys.add(objectKey);
      }
      targetObjects.push({
        ...object,
        url: moved.remoteId,
        etag: moved.remoteEtag ?? object.etag
      });

      await updateAppleLinkAfterRemoteMove(deps.eventPool, {
        previousRemoteId: object.url,
        nextRemoteId: moved.remoteId,
        remoteUid: moved.remoteUid,
        remoteEtag: moved.remoteEtag,
        remoteCalendarId: targetCalendar.url,
        remoteCalendarName: getCalendarName(targetCalendar)
      });
    }

    calendarsToDelete.set(calendar.url, calendar);
  }

  const groupedByName = new Map<string, DAVCalendar[]>();
  for (const calendar of pulseManagedCalendars) {
    if (calendarsToDelete.has(calendar.url)) {
      continue;
    }
    const normalizedName = normalizeLooseText(getCalendarName(calendar));
    if (!normalizedName) {
      continue;
    }
    const current = groupedByName.get(normalizedName) ?? [];
    current.push(calendar);
    groupedByName.set(normalizedName, current);
  }

  for (const [, duplicates] of groupedByName) {
    if (duplicates.length <= 1) {
      continue;
    }

    const withObjects = await Promise.all(
      duplicates.map(async (calendar) => {
        const objects = await client.fetchCalendarObjects({ calendar });
        return {
          calendar,
          objects,
          objectCount: objects.length
        };
      })
    );

    const sorted = withObjects.sort((left, right) => right.objectCount - left.objectCount);
    const keep = sorted[0];
    const keeperCalendarName = getCalendarName(keep.calendar);
    const keeperObjectKeys = new Set(
      keep.objects.map((object) => buildCalendarObjectKey(object)).filter(Boolean)
    );

    for (const entry of sorted.slice(1)) {
      for (const object of entry.objects) {
        const objectKey = buildCalendarObjectKey(object);
        if (objectKey && keeperObjectKeys.has(objectKey)) {
          const existingTargetObject = findMatchingCalendarObjectByKey(keep.objects, objectKey);
          await updateAppleLinkAfterRemoteMove(deps.eventPool, {
            previousRemoteId: object.url,
            nextRemoteId: existingTargetObject?.url ?? object.url,
            remoteUid: extractRemoteUidFromIcs(existingTargetObject?.data ?? object.data),
            remoteEtag: existingTargetObject?.etag ?? object.etag ?? null,
            remoteCalendarId: keep.calendar.url,
            remoteCalendarName: keeperCalendarName
          });
          continue;
        }

        const moved = await copyCalendarObjectToCalendar(client, keep.calendar, object);
        if (objectKey) {
          keeperObjectKeys.add(objectKey);
        }
        keep.objects.push({
          ...object,
          url: moved.remoteId,
          etag: moved.remoteEtag ?? object.etag
        });

        await updateAppleLinkAfterRemoteMove(deps.eventPool, {
          previousRemoteId: object.url,
          nextRemoteId: moved.remoteId,
          remoteUid: moved.remoteUid,
          remoteEtag: moved.remoteEtag,
          remoteCalendarId: keep.calendar.url,
          remoteCalendarName: keeperCalendarName
        });
      }

      calendarsToDelete.set(entry.calendar.url, entry.calendar);
    }
  }

  const deletedNames: string[] = [];
  for (const calendar of calendarsToDelete.values()) {
    await deleteCalendarCollection(
      deps.serverUrl,
      connection.accountEmail,
      connection.appSpecificPassword,
      calendar.url
    );
    deletedNames.push(getCalendarName(calendar));
  }

  if (deletedNames.length > 0) {
    deps.logger?.log?.(
      `[apple-connector] Removidos ${deletedNames.length} calendários automáticos inválidos/duplicados.`
    );
  }

  return {
    deletedCount: deletedNames.length,
    deletedNames
  };
}

function extractFilenameFromCalendarObjectUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const filename = parsed.pathname.split("/").filter(Boolean).at(-1);
    return filename && filename.trim().length > 0 ? filename : `${randomUUID()}.ics`;
  } catch {
    return `${randomUUID()}.ics`;
  }
}

function extractRemoteUidFromIcs(data: string): string | null {
  const match = data.match(/^\s*UID:(.+)\s*$/imu);
  return match?.[1]?.trim() ?? null;
}

function buildCalendarObjectKey(object: DAVCalendarObject): string | null {
  const remoteUid = extractRemoteUidFromIcs(object.data);
  if (remoteUid) {
    return `uid:${normalizeLooseText(remoteUid)}`;
  }

  const normalizedData = normalizeLooseText(object.data);
  return normalizedData ? `data:${normalizedData}` : null;
}

function findMatchingCalendarObjectByKey(
  objects: DAVCalendarObject[],
  key: string | null
): DAVCalendarObject | null {
  if (!key) {
    return null;
  }

  return objects.find((object) => buildCalendarObjectKey(object) === key) ?? null;
}

async function copyCalendarObjectToCalendar(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendar: DAVCalendar,
  object: DAVCalendarObject
): Promise<{ remoteId: string; remoteUid: string | null; remoteEtag: string | null }> {
  const filename = extractFilenameFromCalendarObjectUrl(object.url);
  const response = await client.createCalendarObject({
    calendar,
    filename,
    iCalString: object.data
  });

  const remoteId =
    response.headers.get("location") !== null
      ? new URL(response.headers.get("location") as string, calendar.url).href
      : new URL(filename, calendar.url).href;

  return {
    remoteId,
    remoteUid: extractRemoteUidFromIcs(object.data),
    remoteEtag: response.headers.get("etag")
  };
}

async function updateAppleLinkAfterRemoteMove(
  eventPool: Pool,
  input: {
    previousRemoteId: string;
    nextRemoteId: string;
    remoteUid: string | null;
    remoteEtag: string | null;
    remoteCalendarId: string;
    remoteCalendarName: string;
  }
): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_provider_links
      SET
        remote_id = $1,
        remote_uid = COALESCE($2, remote_uid),
        remote_etag = $3,
        remote_calendar_id = $4,
        remote_calendar_name = $5,
        last_synced_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      WHERE provider = $6
        AND remote_id = $7
    `,
    [
      input.nextRemoteId,
      input.remoteUid,
      input.remoteEtag,
      input.remoteCalendarId,
      input.remoteCalendarName,
      APPLE_PROVIDER,
      input.previousRemoteId
    ]
  );
}

async function resolveCalendarForLink(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  link: AppleProviderLink,
  existingCalendars?: DAVCalendar[]
): Promise<DAVCalendar | null> {
  const calendars = existingCalendars ?? (await client.fetchCalendars());
  return findCalendarByIdOrName(calendars, link.remoteCalendarId, link.remoteCalendarName);
}

export async function syncSingleEventToApple(
  deps: AppleSyncDependencies,
  eventId: string
): Promise<void> {
  try {
    const event = await getStoredEventById(deps.eventPool, eventId, false);
    if (!event || event.deletedAt || !event.sourceUserId) {
      return;
    }

    const connection = await getEnabledAppleConnectionForDiscordUser(deps, event.sourceUserId);
    if (!connection) {
      return;
    }

    const client = await createAppleDavClient(
      deps.serverUrl,
      connection.accountEmail,
      connection.appSpecificPassword
    );
    const fetchedCalendars = await client.fetchCalendars();
    const target = await resolveTargetCalendarForEvent(client, connection, event, fetchedCalendars);
    const existingLink = await getAppleLinkByEventId(deps.eventPool, event.pageId);

    if (!existingLink) {
      const created = await createRemoteCalendarObject(client, target.calendar, event, existingLink);
      await upsertAppleProviderLink(deps.eventPool, {
        eventId: event.pageId,
        remoteId: created.remoteId,
        remoteUid: created.remoteUid,
        remoteEtag: created.remoteEtag,
        remoteCalendarId: target.calendar.url,
        remoteCalendarName: getCalendarName(target.calendar),
        lastError: null
      });
      await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, null, true);
      return;
    }

    const linkedCalendar =
      (await resolveCalendarForLink(client, existingLink, target.calendars)) ?? target.calendar;
    const remoteObject = await resolveRemoteObjectForLink(client, linkedCalendar, existingLink);
    if (!remoteObject) {
      const created = await createRemoteCalendarObject(client, target.calendar, event, existingLink);
      await upsertAppleProviderLink(deps.eventPool, {
        eventId: event.pageId,
        remoteId: created.remoteId,
        remoteUid: created.remoteUid,
        remoteEtag: created.remoteEtag,
        remoteCalendarId: target.calendar.url,
        remoteCalendarName: getCalendarName(target.calendar),
        lastError: null
      });
      await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, null, true);
      return;
    }

    if (linkedCalendar.url !== target.calendar.url) {
      await client.deleteCalendarObject({
        calendarObject: remoteObject
      });

      const created = await createRemoteCalendarObject(client, target.calendar, event, existingLink);
      await upsertAppleProviderLink(deps.eventPool, {
        eventId: event.pageId,
        remoteId: created.remoteId,
        remoteUid: created.remoteUid,
        remoteEtag: created.remoteEtag,
        remoteCalendarId: target.calendar.url,
        remoteCalendarName: getCalendarName(target.calendar),
        lastError: null
      });
      await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, null, true);
      return;
    }

    const updatedRemote = await updateRemoteCalendarObject(
      client,
      remoteObject,
      event,
      existingLink.remoteUid
    );

    await upsertAppleProviderLink(deps.eventPool, {
      eventId: event.pageId,
      remoteId: remoteObject.url,
      remoteUid: existingLink.remoteUid ?? extractRemoteUid(updatedRemote),
      remoteEtag: updatedRemote.headers.get("etag") ?? existingLink.remoteEtag,
      remoteCalendarId: target.calendar.url,
      remoteCalendarName: getCalendarName(target.calendar),
      lastError: null
    });

    await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, null, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger?.error?.(`[calendar-service] Apple sync single event falhou: ${message}`);
    const localEvent = await getStoredEventById(deps.eventPool, eventId, true);
    const connection =
      localEvent?.sourceUserId
        ? await getEnabledAppleConnectionForDiscordUser(deps, localEvent.sourceUserId)
        : null;
    if (connection) {
      await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, message, false);
    }
    await setAppleLinkErrorByEventId(deps.eventPool, eventId, message);
  }
}

export async function deleteSingleEventFromApple(
  deps: AppleSyncDependencies,
  eventId: string
): Promise<void> {
  try {
    const localEvent = await getStoredEventById(deps.eventPool, eventId, true);
    if (!localEvent?.sourceUserId) {
      return;
    }

    const connection = await getEnabledAppleConnectionForDiscordUser(deps, localEvent.sourceUserId);
    if (!connection) {
      return;
    }

    const existingLink = await getAppleLinkByEventId(deps.eventPool, eventId);
    if (!existingLink) {
      return;
    }

    const client = await createAppleDavClient(
      deps.serverUrl,
      connection.accountEmail,
      connection.appSpecificPassword
    );
    const fetchedCalendars = await client.fetchCalendars();
    const calendar = await resolveCalendarForLink(client, existingLink, fetchedCalendars);
    const remoteObject = calendar
      ? await resolveRemoteObjectForLink(client, calendar, existingLink)
      : null;

    if (remoteObject) {
      await client.deleteCalendarObject({
        calendarObject: remoteObject
      });
    }

    await touchAppleLink(deps.eventPool, existingLink.eventId, {
      lastError: null
    });
    await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, null, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger?.error?.(`[calendar-service] Apple delete falhou: ${message}`);
    const localEvent = await getStoredEventById(deps.eventPool, eventId, true);
    const connection =
      localEvent?.sourceUserId
        ? await getEnabledAppleConnectionForDiscordUser(deps, localEvent.sourceUserId)
        : null;
    if (connection) {
      await updateAppleConnectionSyncStatus(deps.configPool, connection.userId, message, false);
    }
    await setAppleLinkErrorByEventId(deps.eventPool, eventId, message);
  }
}

export async function syncAppleCalendarNow(
  deps: AppleSyncDependencies,
  userId?: string
): Promise<AppleSyncSummary> {
  if (userId) {
    return syncAppleCalendarForUser(deps, userId);
  }

  const userIds = await listEnabledAppleConnectionUserIds(deps.configPool);
  if (userIds.length === 0) {
    return {
      success: false,
      importedLocal: 0,
      updatedLocal: 0,
      deletedLocal: 0,
      createdRemote: 0,
      updatedRemote: 0,
      deletedRemote: 0,
      skipped: 0,
      message: "A sincronização Apple está desligada ou ainda não tem calendário por defeito configurado.",
      lastError: null
    };
  }

  const aggregate: AppleSyncSummary = {
    success: true,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Apple concluída.",
    lastError: null
  };

  for (const currentUserId of userIds) {
    const result = await syncAppleCalendarForUser(deps, currentUserId);
    aggregate.success = aggregate.success && result.success;
    aggregate.importedLocal += result.importedLocal;
    aggregate.updatedLocal += result.updatedLocal;
    aggregate.deletedLocal += result.deletedLocal;
    aggregate.createdRemote += result.createdRemote;
    aggregate.updatedRemote += result.updatedRemote;
    aggregate.deletedRemote += result.deletedRemote;
    aggregate.skipped += result.skipped;
    if (!result.success && !aggregate.lastError) {
      aggregate.lastError = result.lastError;
      aggregate.message = result.message;
    }
  }

  return aggregate;
}

async function syncAppleCalendarForUser(
  deps: AppleSyncDependencies,
  userId: string
): Promise<AppleSyncSummary> {
  const summary: AppleSyncSummary = {
    success: false,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Apple não executada.",
    lastError: null
  };

  try {
    const connection = await getEnabledAppleConnection(deps, { userId });
    if (!connection) {
      summary.message = "A sincronização Apple está desligada ou ainda não tem calendário por defeito configurado.";
      summary.skipped += 1;
      return summary;
    }

    const runtimeLink = await getDashboardRuntimeLink(deps.configPool, userId);
    const client = await createAppleDavClient(
      deps.serverUrl,
      connection.accountEmail,
      connection.appSpecificPassword
    );
    const fetchedCalendars = await client.fetchCalendars();
    const defaultCalendar = await resolveDefaultCalendar(client, connection, fetchedCalendars);
    const managedCalendars = getManagedCalendars(defaultCalendar.calendars);
    const calendarsToSync = managedCalendars.length > 0 ? managedCalendars : [defaultCalendar.calendar];
    const remoteEvents: AppleRemoteEvent[] = [];

    for (const calendar of calendarsToSync) {
      const remoteObjects = await client.fetchCalendarObjects({ calendar });
      const parsedRemoteEvents = remoteObjects
        .map((object) => parseRemoteCalendarObject(object, deps.timezone, calendar))
        .filter((event): event is AppleRemoteEvent => event !== null);

      remoteEvents.push(...parsedRemoteEvents);
    }

    const allLinks = await getAllAppleLinks(deps.eventPool);
    const linkedEvents = await getAllStoredEventsByIds(
      deps.eventPool,
      allLinks.map((link) => link.eventId)
    );
    const allowedEventIds = new Set(
      filterEventsForRuntimeUser(linkedEvents, runtimeLink).map((event) => event.pageId)
    );
    const links = allLinks.filter((link) => allowedEventIds.has(link.eventId));
    const localEvents = await getAllStoredEventsByIds(
      deps.eventPool,
      links.map((link) => link.eventId)
    );
    const scopedLocalEvents = filterEventsForRuntimeUser(localEvents, runtimeLink);
    const localById = new Map(scopedLocalEvents.map((event) => [event.pageId, event]));
    const remoteById = new Map(remoteEvents.map((event) => [event.remoteId, event]));
    const remoteByUid = new Map(
      remoteEvents
        .filter((event) => event.remoteUid)
        .map((event) => [event.remoteUid as string, event])
    );
    const linkedRemoteIds = new Set<string>();

    for (const link of links) {
      const localEvent = localById.get(link.eventId) ?? null;
      const remoteEvent =
        remoteById.get(link.remoteId) ??
        (link.remoteUid ? remoteByUid.get(link.remoteUid) ?? null : null);

      if (!localEvent || localEvent.deletedAt) {
        if (remoteEvent) {
          await client.deleteCalendarObject({
            calendarObject: remoteEvent.calendarObject
          });
          summary.deletedRemote += 1;
          linkedRemoteIds.add(remoteEvent.remoteId);
        }

        await touchAppleLink(deps.eventPool, link.eventId, {
          remoteEtag: remoteEvent?.remoteEtag ?? link.remoteEtag,
          lastError: null
        });
        continue;
      }

      if (!remoteEvent) {
        if (shouldTreatMissingRemoteAsDeletion(localEvent, link)) {
          await softDeleteStoredEvent(deps.eventPool, localEvent.pageId);
          await notifyProvidersAfterRemoteSync(deps, localEvent.pageId, true);
          summary.deletedLocal += 1;
          await touchAppleLink(deps.eventPool, localEvent.pageId, {
            lastError: null
          });
          continue;
        }

        const target = await resolveTargetCalendarForEvent(client, connection, localEvent, defaultCalendar.calendars);
        const created = await createRemoteCalendarObject(client, target.calendar, localEvent, link);
        await upsertAppleProviderLink(deps.eventPool, {
          eventId: localEvent.pageId,
          remoteId: created.remoteId,
          remoteUid: created.remoteUid,
          remoteEtag: created.remoteEtag,
          remoteCalendarId: target.calendar.url,
          remoteCalendarName: getCalendarName(target.calendar),
          lastError: null
        });
        summary.createdRemote += 1;
        linkedRemoteIds.add(created.remoteId);
        continue;
      }

      linkedRemoteIds.add(remoteEvent.remoteId);

      const driftedAfterProviderSync =
        link.lastSyncedAt
          ? await hasNewerNonAppleProviderSync(deps.eventPool, localEvent.pageId, link.lastSyncedAt)
          : false;
      const remoteChanged = hasRemoteChangedSinceLastSync(remoteEvent, link);
      const equivalent = eventsAreEquivalent(localEvent, remoteEvent);

      if (hasLocalChangedSinceLastSync(localEvent, link) && !remoteChanged && !driftedAfterProviderSync) {
        const target = await resolveTargetCalendarForEvent(client, connection, localEvent, defaultCalendar.calendars);
        let response: Response;
        let remoteCalendarId = remoteEvent.remoteCalendarId;
        let remoteCalendarName = remoteEvent.remoteCalendarName;
        let remoteId = remoteEvent.remoteId;

        if (target.calendar.url !== remoteEvent.remoteCalendarId) {
          await client.deleteCalendarObject({
            calendarObject: remoteEvent.calendarObject
          });
          summary.deletedRemote += 1;

          const created = await createRemoteCalendarObject(client, target.calendar, localEvent, link);
          response = new Response(null, {
            headers: created.remoteEtag ? { etag: created.remoteEtag } : {}
          });
          remoteCalendarId = target.calendar.url;
          remoteCalendarName = getCalendarName(target.calendar);
          remoteId = created.remoteId;
        } else {
          response = await updateRemoteCalendarObject(
            client,
            remoteEvent.calendarObject,
            localEvent,
            link.remoteUid
          );
        }

        await upsertAppleProviderLink(deps.eventPool, {
          eventId: localEvent.pageId,
          remoteId,
          remoteUid: link.remoteUid ?? remoteEvent.remoteUid,
          remoteEtag: response.headers.get("etag") ?? remoteEvent.remoteEtag,
          remoteCalendarId,
          remoteCalendarName,
          lastError: null
        });
        summary.updatedRemote += 1;
        continue;
      }

      if (remoteChanged || !equivalent) {
        await applyRemoteEventToLocal(
          deps,
          remoteEvent,
          localEvent.pageId,
          runtimeLink,
          localEvent
        );
        await notifyProvidersAfterRemoteSync(deps, localEvent.pageId, false);
        await upsertAppleProviderLink(deps.eventPool, {
          eventId: localEvent.pageId,
          remoteId: remoteEvent.remoteId,
          remoteUid: remoteEvent.remoteUid ?? link.remoteUid,
          remoteEtag: remoteEvent.remoteEtag,
          remoteCalendarId: remoteEvent.remoteCalendarId,
          remoteCalendarName: remoteEvent.remoteCalendarName,
          lastError: null
        });
        summary.updatedLocal += 1;
        continue;
      }

      await upsertAppleProviderLink(deps.eventPool, {
        eventId: localEvent.pageId,
        remoteId: remoteEvent.remoteId,
        remoteUid: remoteEvent.remoteUid ?? link.remoteUid,
        remoteEtag: remoteEvent.remoteEtag,
        remoteCalendarId: remoteEvent.remoteCalendarId,
        remoteCalendarName: remoteEvent.remoteCalendarName,
        lastError: null
      });
    }

    for (const remoteEvent of remoteEvents) {
      if (linkedRemoteIds.has(remoteEvent.remoteId)) {
        continue;
      }

      const importedEventId = await insertStoredEventFromRemote(deps, remoteEvent, runtimeLink);
      await notifyProvidersAfterRemoteSync(deps, importedEventId, false);
      await upsertAppleProviderLink(deps.eventPool, {
        eventId: importedEventId,
        remoteId: remoteEvent.remoteId,
        remoteUid: remoteEvent.remoteUid,
        remoteEtag: remoteEvent.remoteEtag,
        remoteCalendarId: remoteEvent.remoteCalendarId,
        remoteCalendarName: remoteEvent.remoteCalendarName,
        lastError: null
      });
      summary.importedLocal += 1;
    }

    const unsyncedLocalEvents = filterEventsForRuntimeUser(
      await getActiveStoredEventsWithoutAppleLink(deps.eventPool),
      runtimeLink
    );
    for (const localEvent of unsyncedLocalEvents) {
      const target = await resolveTargetCalendarForEvent(client, connection, localEvent, defaultCalendar.calendars);
      const created = await createRemoteCalendarObject(client, target.calendar, localEvent, null);
      await upsertAppleProviderLink(deps.eventPool, {
        eventId: localEvent.pageId,
        remoteId: created.remoteId,
        remoteUid: created.remoteUid,
        remoteEtag: created.remoteEtag,
        remoteCalendarId: target.calendar.url,
        remoteCalendarName: getCalendarName(target.calendar),
        lastError: null
      });
      summary.createdRemote += 1;
    }

    summary.success = true;
    summary.message = buildAppleSyncMessage(summary);
    await updateAppleConnectionSyncStatus(deps.configPool, userId, null, true);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.lastError = message;
    summary.message = `Falha na sincronização Apple: ${message}`;
    deps.logger?.error?.(`[calendar-service] ${summary.message}`);
    await updateAppleConnectionSyncStatus(deps.configPool, userId, message, false);
    return summary;
  }
}

function buildAppleSyncMessage(summary: AppleSyncSummary): string {
  return [
    `importados local=${summary.importedLocal}`,
    `atualizados local=${summary.updatedLocal}`,
    `apagados local=${summary.deletedLocal}`,
    `criados remoto=${summary.createdRemote}`,
    `atualizados remoto=${summary.updatedRemote}`,
    `apagados remoto=${summary.deletedRemote}`,
    `saltados=${summary.skipped}`
  ].join(" | ");
}

async function resolveRemoteObjectForLink(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendar: DAVCalendar,
  link: AppleProviderLink
): Promise<DAVCalendarObject | null> {
  const objects = await client.fetchCalendarObjects({
    calendar,
    urlFilter: (url) => url === link.remoteId
  });

  return objects[0] ?? null;
}

async function createRemoteCalendarObject(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendar: DAVCalendar,
  event: LocalCalendarEvent,
  existingLink: AppleProviderLink | null
): Promise<{ remoteId: string; remoteUid: string; remoteEtag: string | null }> {
  const remoteUid = existingLink?.remoteUid ?? buildRemoteUid(event.pageId);
  const filename = `${event.pageId}.ics`;
  const iCalString = buildEventIcs(event, remoteUid, event.timezone);
  const response = await client.createCalendarObject({
    calendar,
    filename,
    iCalString
  });

  const remoteId =
    response.headers.get("location") !== null
      ? new URL(response.headers.get("location") as string, calendar.url).href
      : new URL(filename, calendar.url).href;

  return {
    remoteId,
    remoteUid,
    remoteEtag: response.headers.get("etag")
  };
}

async function updateRemoteCalendarObject(
  client: Awaited<ReturnType<typeof createAppleDavClient>>,
  calendarObject: DAVCalendarObject,
  event: LocalCalendarEvent,
  remoteUid: string | null
) {
  return client.updateCalendarObject({
    calendarObject: {
      ...calendarObject,
      data: buildEventIcs(event, remoteUid ?? buildRemoteUid(event.pageId), event.timezone)
    }
  });
}

async function getAppleLinkByEventId(
  eventPool: Pool,
  eventId: string
): Promise<AppleProviderLink | null> {
  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_provider_links
      WHERE provider = $1
        AND event_id = $2
      LIMIT 1
    `,
    [APPLE_PROVIDER, eventId]
  );

  return result.rows[0] ? mapAppleProviderLink(result.rows[0] as Record<string, unknown>) : null;
}

async function getAllAppleLinks(eventPool: Pool): Promise<AppleProviderLink[]> {
  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_provider_links
      WHERE provider = $1
    `,
    [APPLE_PROVIDER]
  );

  return result.rows.map((row) => mapAppleProviderLink(row as Record<string, unknown>));
}

async function upsertAppleProviderLink(
  eventPool: Pool,
  input: {
    eventId: string;
    remoteId: string;
    remoteUid: string | null;
    remoteEtag: string | null;
    remoteCalendarId: string | null;
    remoteCalendarName: string | null;
    lastError: string | null;
  }
): Promise<void> {
  await eventPool.query(
    `
      INSERT INTO calendar_provider_links (
        id,
        event_id,
        provider,
        remote_id,
        remote_uid,
        remote_etag,
        remote_calendar_id,
        remote_calendar_name,
        last_synced_at,
        last_error,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW()
      )
      ON CONFLICT (provider, event_id)
      DO UPDATE
      SET
        remote_id = EXCLUDED.remote_id,
        remote_uid = EXCLUDED.remote_uid,
        remote_etag = EXCLUDED.remote_etag,
        remote_calendar_id = EXCLUDED.remote_calendar_id,
        remote_calendar_name = EXCLUDED.remote_calendar_name,
        last_synced_at = NOW(),
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
    `,
    [
      randomUUID(),
      input.eventId,
      APPLE_PROVIDER,
      input.remoteId,
      input.remoteUid,
      input.remoteEtag,
      input.remoteCalendarId,
      input.remoteCalendarName,
      input.lastError
    ]
  );
}

async function touchAppleLink(
  eventPool: Pool,
  eventId: string,
  input: {
    remoteEtag?: string | null;
    lastError: string | null;
  }
): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_provider_links
      SET
        remote_etag = COALESCE($3, remote_etag),
        last_synced_at = NOW(),
        last_error = $4,
        updated_at = NOW()
      WHERE provider = $1
        AND event_id = $2
    `,
    [APPLE_PROVIDER, eventId, input.remoteEtag ?? null, input.lastError]
  );
}

async function setAppleLinkErrorByEventId(
  eventPool: Pool,
  eventId: string,
  lastError: string
): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_provider_links
      SET
        last_error = $3,
        updated_at = NOW()
      WHERE provider = $1
        AND event_id = $2
    `,
    [APPLE_PROVIDER, eventId, lastError]
  );
}

async function getStoredEventById(
  eventPool: Pool,
  eventId: string,
  includeDeleted: boolean
): Promise<LocalCalendarEvent | null> {
  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_events
      WHERE id = $1
        ${includeDeleted ? "" : "AND deleted_at IS NULL"}
      LIMIT 1
    `,
    [eventId]
  );

  return result.rows[0] ? mapStoredEvent(result.rows[0] as Record<string, unknown>) : null;
}

async function getAllStoredEventsByIds(eventPool: Pool, ids: string[]): Promise<LocalCalendarEvent[]> {
  if (ids.length === 0) {
    return [];
  }

  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_events
      WHERE id = ANY($1::text[])
    `,
    [ids]
  );

  return result.rows.map((row) => mapStoredEvent(row as Record<string, unknown>));
}

async function getActiveStoredEventsWithoutAppleLink(eventPool: Pool): Promise<LocalCalendarEvent[]> {
  const result = await eventPool.query(
    `
      SELECT e.*
      FROM calendar_events e
      LEFT JOIN calendar_provider_links l
        ON l.event_id = e.id
       AND l.provider = $1
      WHERE e.deleted_at IS NULL
        AND l.id IS NULL
      ORDER BY e.event_date ASC, COALESCE(e.start_time, '00:00') ASC, e.created_at ASC
    `,
    [APPLE_PROVIDER]
  );

  return result.rows.map((row) => mapStoredEvent(row as Record<string, unknown>));
}

async function softDeleteStoredEvent(eventPool: Pool, eventId: string): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_events
      SET
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [eventId]
  );
}

async function insertStoredEventFromRemote(
  deps: AppleSyncDependencies,
  remoteEvent: AppleRemoteEvent,
  runtimeLink: DashboardRuntimeLink | null
): Promise<string> {
  const eventId = randomUUID();

  await deps.eventPool.query(
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL,
        $10, $11, $12, $13, NULL, $14
      )
    `,
    [
      eventId,
      remoteEvent.title,
      remoteEvent.date,
      remoteEvent.endDate ?? null,
      remoteEvent.startTime ?? null,
      remoteEvent.endTime ?? null,
      remoteEvent.allDay,
      remoteEvent.description ?? null,
      deps.resolveCategoryLabel(remoteEvent.title, remoteEvent.description, undefined),
      "apple-calendar",
      runtimeLink?.conversationChannelId ?? null,
      runtimeLink?.linkedDiscordUserId ?? null,
      runtimeLink?.linkedDiscordUsername ?? null,
      remoteEvent.timezone
    ]
  );

  return eventId;
}

async function applyRemoteEventToLocal(
  deps: AppleSyncDependencies,
  remoteEvent: AppleRemoteEvent,
  localEventId: string,
  runtimeLink: DashboardRuntimeLink | null,
  existingLocalEvent: LocalCalendarEvent | null
): Promise<void> {
  const sourceName = existingLocalEvent?.sourceName ?? "apple-calendar";
  const sourceChannelId =
    existingLocalEvent?.sourceChannelId ?? runtimeLink?.conversationChannelId ?? null;
  const sourceUserId =
    existingLocalEvent?.sourceUserId ?? runtimeLink?.linkedDiscordUserId ?? null;
  const sourceUsername =
    existingLocalEvent?.sourceUsername ?? runtimeLink?.linkedDiscordUsername ?? null;

  await deps.eventPool.query(
    `
      UPDATE calendar_events
      SET
        title = $2,
        event_date = $3,
        end_date = $4,
        start_time = $5,
        end_time = $6,
        all_day = $7,
        description = $8,
        category = $9,
        source_name = $10,
        source_channel_id = $11,
        source_user_id = $12,
        source_username = $13,
        timezone = $14,
        deleted_at = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      localEventId,
      remoteEvent.title,
      remoteEvent.date,
      remoteEvent.endDate ?? null,
      remoteEvent.startTime ?? null,
      remoteEvent.endTime ?? null,
      remoteEvent.allDay,
      remoteEvent.description ?? null,
      deps.resolveCategoryLabel(
        remoteEvent.title,
        remoteEvent.description,
        existingLocalEvent?.category
      ),
      sourceName,
      sourceChannelId,
      sourceUserId,
      sourceUsername,
      remoteEvent.timezone
    ]
  );
}

async function updateAppleConnectionSyncStatus(
  configPool: Pool,
  userId: string,
  lastError: string | null,
  success: boolean
): Promise<void> {
  await configPool.query(
    `
      UPDATE apple_calendar_connections
      SET
        last_sync_at = CASE WHEN $1 THEN NOW() ELSE last_sync_at END,
        last_error = $2,
        updated_at = NOW()
      WHERE user_id = $3
    `,
    [success, lastError, userId]
  );
}

async function getDashboardRuntimeLink(
  configPool: Pool,
  userId: string
): Promise<DashboardRuntimeLink | null> {
  try {
    const result = await configPool.query(
      `
        SELECT
          linked_discord_user_id,
          linked_discord_username,
          conversation_channel_id
        FROM dashboard_runtime_settings
        WHERE enabled = TRUE
          AND user_id = $1
          AND conversation_channel_id IS NOT NULL
          AND linked_discord_user_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [userId]
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    return {
      linkedDiscordUserId:
        typeof row.linked_discord_user_id === "string" ? row.linked_discord_user_id : null,
      linkedDiscordUsername:
        typeof row.linked_discord_username === "string" ? row.linked_discord_username : null,
      conversationChannelId:
        typeof row.conversation_channel_id === "string" ? row.conversation_channel_id : null
    };
  } catch {
    return null;
  }
}

function filterEventsForRuntimeUser(
  events: LocalCalendarEvent[],
  runtimeLink: DashboardRuntimeLink | null
): LocalCalendarEvent[] {
  const linkedDiscordUserId = runtimeLink?.linkedDiscordUserId ?? null;
  if (!linkedDiscordUserId) {
    return [];
  }

  return events.filter((event) => event.sourceUserId === linkedDiscordUserId);
}

function parseRemoteCalendarObject(
  calendarObject: DAVCalendarObject,
  fallbackTimezone: string,
  calendar: DAVCalendar
): AppleRemoteEvent | null {
  if (typeof calendarObject.data !== "string" || !calendarObject.url) {
    return null;
  }

  const parsed = ical.sync.parseICS(calendarObject.data);
  const event = Object.values(parsed).find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "type" in entry &&
      (entry as { type?: unknown }).type === "VEVENT"
  ) as Record<string, unknown> | undefined;

  if (!event) {
    return null;
  }

  const start = asICalDate(event.start);
  if (!start) {
    return null;
  }

  const end = asICalDate(event.end);
  const timezone = start.tz || fallbackTimezone;
  const allDay = start.dateOnly === true;
  const title = extractICalText(event.summary) || "Evento Apple";
  const description = extractICalText(event.description) || undefined;

  if (allDay) {
    const date = start.toISOString().slice(0, 10);
    const exclusiveEnd = end ? end.toISOString().slice(0, 10) : date;
    const inclusiveEnd = end ? addDays(exclusiveEnd, -1) : date;
    return {
      remoteId: calendarObject.url,
      remoteUid: typeof event.uid === "string" ? event.uid : null,
      remoteEtag: typeof calendarObject.etag === "string" ? calendarObject.etag : null,
      remoteCalendarId: calendar.url,
      remoteCalendarName: getCalendarName(calendar),
      title,
      description,
      date,
      endDate: inclusiveEnd !== date ? inclusiveEnd : undefined,
      allDay: true,
      timezone,
      calendarObject
    };
  }

  const date = formatDateInTimeZone(start, timezone);
  const endDate = end ? formatDateInTimeZone(end, timezone) : date;

  return {
    remoteId: calendarObject.url,
    remoteUid: typeof event.uid === "string" ? event.uid : null,
    remoteEtag: typeof calendarObject.etag === "string" ? calendarObject.etag : null,
    remoteCalendarId: calendar.url,
    remoteCalendarName: getCalendarName(calendar),
    title,
    description,
    date,
    endDate: endDate !== date ? endDate : undefined,
    startTime: formatTimeInTimeZone(start, timezone),
    endTime: end ? formatTimeInTimeZone(end, timezone) : undefined,
    allDay: false,
    timezone,
    calendarObject
  };
}

function asICalDate(value: unknown): (Date & { tz?: string; dateOnly?: true }) | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value as Date & { tz?: string; dateOnly?: true };
  }

  return null;
}

function extractICalText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const nested = (value as { val?: unknown }).val;
    if (typeof nested === "string") {
      return nested.trim();
    }
  }

  return "";
}

function mapStoredEvent(row: Record<string, unknown>): LocalCalendarEvent {
  return {
    pageId: String(row.id),
    title: String(row.title),
    date: formatDateValue(row.event_date),
    endDate: formatNullableDateValue(row.end_date),
    startTime: formatNullableTimeValue(row.start_time),
    endTime: formatNullableTimeValue(row.end_time),
    allDay: row.all_day === true,
    description: typeof row.description === "string" ? row.description : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    sourceName: typeof row.source_name === "string" ? row.source_name : undefined,
    sourceChannelId: typeof row.source_channel_id === "string" ? row.source_channel_id : undefined,
    sourceUserId: typeof row.source_user_id === "string" ? row.source_user_id : undefined,
    sourceUsername: typeof row.source_username === "string" ? row.source_username : undefined,
    sourceMessageId: typeof row.source_message_id === "string" ? row.source_message_id : undefined,
    timezone: typeof row.timezone === "string" ? row.timezone : undefined,
    rawDate: typeof row.raw_date === "string" ? row.raw_date : undefined,
    deletedAt: asIsoString(row.deleted_at) ?? undefined,
    updatedAt: asIsoString(row.updated_at) ?? undefined,
    createdAt: asIsoString(row.created_at) ?? undefined
  };
}

function mapAppleProviderLink(row: Record<string, unknown>): AppleProviderLink {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    remoteId: String(row.remote_id),
    remoteUid: typeof row.remote_uid === "string" ? row.remote_uid : null,
    remoteEtag: typeof row.remote_etag === "string" ? row.remote_etag : null,
    remoteCalendarId:
      typeof row.remote_calendar_id === "string" ? row.remote_calendar_id : null,
    remoteCalendarName:
      typeof row.remote_calendar_name === "string" ? row.remote_calendar_name : null,
    lastSyncedAt: asIsoString(row.last_synced_at),
    lastError: typeof row.last_error === "string" ? row.last_error : null
  };
}

function shouldTreatMissingRemoteAsDeletion(
  localEvent: LocalCalendarEvent,
  link: AppleProviderLink
): boolean {
  if (!link.lastSyncedAt || !localEvent.updatedAt) {
    return false;
  }

  return toEpoch(localEvent.updatedAt) <= toEpoch(link.lastSyncedAt);
}

function hasLocalChangedSinceLastSync(
  localEvent: LocalCalendarEvent,
  link: AppleProviderLink
): boolean {
  if (!localEvent.updatedAt) {
    return false;
  }

  if (!link.lastSyncedAt) {
    return true;
  }

  return toEpoch(localEvent.updatedAt) > toEpoch(link.lastSyncedAt);
}

function hasRemoteChangedSinceLastSync(
  remoteEvent: AppleRemoteEvent,
  link: AppleProviderLink
): boolean {
  if (!remoteEvent.remoteEtag) {
    return false;
  }

  return remoteEvent.remoteEtag !== link.remoteEtag;
}

async function hasNewerNonAppleProviderSync(
  eventPool: Pool,
  eventId: string,
  appleLastSyncedAt: string
): Promise<boolean> {
  const result = await eventPool.query<{ newer_exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM calendar_provider_links
        WHERE event_id = $1
          AND provider <> $2
          AND last_synced_at IS NOT NULL
          AND last_synced_at > $3::timestamptz
     ) AS newer_exists`,
    [eventId, APPLE_PROVIDER, appleLastSyncedAt]
  );

  return result.rows[0]?.newer_exists === true;
}

async function notifyProvidersAfterRemoteSync(
  deps: AppleSyncDependencies,
  eventId: string,
  deleted: boolean
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (deleted) {
    if (deps.notifyGoogleEventDelete) {
      tasks.push(
        deps.notifyGoogleEventDelete(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[apple-connector] Nao consegui propagar delete para Google (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
    if (deps.notifyNotionEventDelete) {
      tasks.push(
        deps.notifyNotionEventDelete(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[apple-connector] Nao consegui propagar delete para Notion (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
  } else {
    if (deps.notifyGoogleEventSync) {
      tasks.push(
        deps.notifyGoogleEventSync(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[apple-connector] Nao consegui propagar update para Google (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
    if (deps.notifyNotionEventSync) {
      tasks.push(
        deps.notifyNotionEventSync(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[apple-connector] Nao consegui propagar update para Notion (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
  }

  await Promise.all(tasks);
}

function eventsAreEquivalent(localEvent: LocalCalendarEvent, remoteEvent: AppleRemoteEvent): boolean {
  return (
    normalizeText(localEvent.title) === normalizeText(remoteEvent.title) &&
    normalizeText(localEvent.description ?? "") === normalizeText(remoteEvent.description ?? "") &&
    localEvent.date === remoteEvent.date &&
    (localEvent.endDate ?? "") === (remoteEvent.endDate ?? "") &&
    (localEvent.startTime ?? "") === (remoteEvent.startTime ?? "") &&
    (localEvent.endTime ?? "") === (remoteEvent.endTime ?? "") &&
    Boolean(localEvent.allDay) === Boolean(remoteEvent.allDay)
  );
}

function buildEventIcs(
  event: LocalCalendarEvent,
  remoteUid: string,
  fallbackTimezone?: string
): string {
  const timezone = event.timezone || fallbackTimezone || "Europe/Lisbon";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pulse//Apple Calendar Sync//PT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(remoteUid)}`,
    `DTSTAMP:${formatUtcDateTimeForIcs(new Date())}`,
    `LAST-MODIFIED:${formatUtcDateTimeForIcs(new Date())}`,
    `SUMMARY:${escapeIcsText(event.title)}`
  ];

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  }

  if (event.category) {
    lines.push(`CATEGORIES:${escapeIcsText(event.category)}`);
  }

  if (event.allDay) {
    const startDate = event.date;
    const endDateExclusive = addDays(event.endDate ?? event.date, 1);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(endDateExclusive)}`);
  } else {
    const startDate = event.date;
    const endDate =
      event.endDate ??
      (shouldRollTimedEventToNextDay(event.startTime, event.endTime) ? addDays(event.date, 1) : event.date);
    const startTime = event.startTime ?? "00:00";
    const endTime = event.endTime ?? startTime;
    lines.push(`DTSTART;TZID=${escapeIcsText(timezone)}:${toIcsDateTime(startDate, startTime)}`);
    lines.push(`DTEND;TZID=${escapeIcsText(timezone)}:${toIcsDateTime(endDate, endTime)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR", "");
  return lines.join("\r\n");
}

function buildRemoteUid(eventId: string): string {
  return `pulse-${eventId}@agentpulse.local`;
}

function extractRemoteUid(response: Response): string | null {
  const location = response.headers.get("location");
  return location ? location.split("/").pop()?.replace(/\.ics$/iu, "") ?? null : null;
}

function shouldRollTimedEventToNextDay(
  startTime: string | undefined,
  endTime: string | undefined
): boolean {
  if (!startTime || !endTime) {
    return false;
  }

  return normalizeClockValue(endTime) <= normalizeClockValue(startTime);
}

function normalizeClockValue(value: string): number {
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw ?? "0");
  const minutes = Number(minutesRaw ?? "0");

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function formatDateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return String(value);
}

function formatNullableDateValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return formatDateValue(value);
}

function formatNullableTimeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(
      value.getUTCMinutes()
    ).padStart(2, "0")}`;
  }

  return String(value).slice(0, 5);
}

function asIsoString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return `${findPart(parts, "year")}-${findPart(parts, "month")}-${findPart(parts, "day")}`;
}

function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("pt-PT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return `${findPart(parts, "hour")}:${findPart(parts, "minute")}`;
}

function findPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function toIcsDate(date: string): string {
  return date.replace(/-/gu, "");
}

function toIcsDateTime(date: string, time: string): string {
  return `${toIcsDate(date)}T${time.replace(/:/gu, "")}00`;
}

function formatUtcDateTimeForIcs(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replace(/-/gu, "")}T${iso.slice(11, 19).replace(/:/gu, "")}Z`;
}

function addDays(date: string, amount: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\r?\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-PT");
}

function toEpoch(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function decryptSecret(ciphertext: string, secret: string): string {
  const [ivPart, tagPart, contentPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !contentPart) {
    throw new Error("O segredo Apple guardado está inválido.");
  }

  const key = deriveEncryptionKey(secret);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(contentPart, "base64url")),
    decipher.final()
  ]).toString("utf-8");
}

function deriveEncryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// Mantido para espelhar o formato usado na dashboard e evitar acoplamento escondido.
export function encryptSecretForApple(value: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

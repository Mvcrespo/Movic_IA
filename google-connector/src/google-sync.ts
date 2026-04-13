import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

import { google, type calendar_v3 } from "googleapis";
import { type Pool } from "pg";

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

type GoogleCalendarConnectionRow = {
  id: string;
  user_id: string | null;
  enabled: boolean;
  account_email: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: Date | null;
  selected_calendar_id: string | null;
  selected_calendar_name: string | null;
  discovered_calendars_json: string | null;
  sync_mode: string;
  oauth_state: string | null;
  oauth_state_expires_at: Date | null;
  last_tested_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
};

type GoogleConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string;
  accessToken: string | null;
  refreshToken: string;
  tokenExpiry: string | null;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  syncMode: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type GoogleProviderLink = {
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

type GoogleRemoteEvent = {
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
  status: string;
  updatedAt: string | null;
  pulseEventId: string | null;
};

export type GoogleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  primary: boolean;
};

export type GoogleAuthUrlResult = {
  url: string;
  state: string;
};

export type GoogleConnectionExchangeResult = {
  accountEmail: string;
  calendars: GoogleCalendarOption[];
  defaultCalendar: GoogleCalendarOption;
};

export type GoogleSyncSummary = {
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

export type GoogleSyncDependencies = {
  eventPool: Pool;
  configPool: Pool;
  timezone: string;
  configEncryptionKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  logger?: Pick<Console, "log" | "warn" | "error">;
  resolveCategoryLabel: (title: string, description?: string, explicitCategory?: string) => string;
  notifyAppleEventSync?: (eventId: string) => Promise<void>;
  notifyAppleEventDelete?: (eventId: string) => Promise<void>;
  notifyNotionEventSync?: (eventId: string) => Promise<void>;
  notifyNotionEventDelete?: (eventId: string) => Promise<void>;
};

const GOOGLE_PROVIDER = "google";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/userinfo.email"
];

export async function ensureGoogleSyncSchema(
  deps: Pick<GoogleSyncDependencies, "eventPool" | "configPool">
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
    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      account_email TEXT NULL,
      access_token_encrypted TEXT NULL,
      refresh_token_encrypted TEXT NULL,
      token_expiry TIMESTAMPTZ NULL,
      selected_calendar_id TEXT NULL,
      selected_calendar_name TEXT NULL,
      discovered_calendars_json TEXT NULL,
      sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      oauth_state TEXT NULL,
      oauth_state_expires_at TIMESTAMPTZ NULL,
      last_tested_at TIMESTAMPTZ NULL,
      last_sync_at TIMESTAMPTZ NULL,
      last_error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await deps.configPool.query(`
    ALTER TABLE google_calendar_connections
      ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT NULL,
      ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT NULL,
      ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS selected_calendar_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS discovered_calendars_json TEXT NULL,
      ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      ADD COLUMN IF NOT EXISTS oauth_state TEXT NULL,
      ADD COLUMN IF NOT EXISTS oauth_state_expires_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_error TEXT NULL
  `);

  await deps.configPool.query(`
    CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_user
    ON google_calendar_connections (user_id)
  `);
}

export async function createGoogleAuthUrl(
  deps: Pick<
    GoogleSyncDependencies,
    "configPool" | "googleClientId" | "googleClientSecret" | "googleRedirectUri"
  >,
  userId: string
): Promise<GoogleAuthUrlResult> {
  ensureGoogleOAuthConfig(deps);
  const row = await ensureGoogleConnectionRow(deps.configPool, userId);
  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await deps.configPool.query(
    `
      UPDATE google_calendar_connections
      SET oauth_state = $2,
          oauth_state_expires_at = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [row.id, state, expiresAt.toISOString()]
  );

  const oauth2Client = createGoogleOAuthClient(deps);

  return {
    state,
    url: oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: GOOGLE_SCOPES,
      state,
      include_granted_scopes: true
    })
  };
}

export async function exchangeGoogleAuthorizationCode(
  deps: Pick<
    GoogleSyncDependencies,
    | "configPool"
    | "configEncryptionKey"
    | "googleClientId"
    | "googleClientSecret"
    | "googleRedirectUri"
    | "timezone"
    | "logger"
  >,
  input: { code: string; state: string },
  userId: string
): Promise<GoogleConnectionExchangeResult> {
  ensureGoogleOAuthConfig(deps);
  if (!deps.configEncryptionKey) {
    throw new Error("Falta CONFIG_ENCRYPTION_KEY para guardar a ligação Google com segurança.");
  }

  const row = await getRawGoogleConnectionRow(deps.configPool, userId);
  if (!row?.oauth_state || !row.oauth_state_expires_at) {
    throw new Error("Não existe nenhuma ligação Google pendente na dashboard.");
  }

  if (row.oauth_state !== input.state) {
    throw new Error("O estado OAuth do Google não coincide com o pedido atual.");
  }

  if (row.oauth_state_expires_at.getTime() <= Date.now()) {
    throw new Error("A ligação Google expirou. Volta a clicar em ligar Google Calendar.");
  }

  const oauth2Client = createGoogleOAuthClient(deps);
  const tokenResult = await oauth2Client.getToken(input.code);
  oauth2Client.setCredentials(tokenResult.tokens);

  const refreshToken = tokenResult.tokens.refresh_token;
  if (!refreshToken && !row.refresh_token_encrypted) {
    throw new Error("O Google não devolveu refresh token. Volta a ligar e aceita novamente as permissões.");
  }

  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2Api.userinfo.get();
  const accountEmail = userInfo.data.email?.trim();

  if (!accountEmail) {
    throw new Error("Não consegui descobrir o email da conta Google ligada.");
  }

  const calendarApi = google.calendar({ version: "v3", auth: oauth2Client });
  const ensured = await ensureDefaultGoogleCalendar(calendarApi, deps.timezone);

  const accessTokenToStore =
    tokenResult.tokens.access_token ??
    decryptNullableSecret(row.access_token_encrypted, deps.configEncryptionKey);
  const refreshTokenToStore =
    refreshToken ??
    decryptSecret(row.refresh_token_encrypted ?? "", deps.configEncryptionKey);

  await deps.configPool.query(
    `
      UPDATE google_calendar_connections
      SET
        enabled = TRUE,
        account_email = $2,
        access_token_encrypted = $3,
        refresh_token_encrypted = $4,
        token_expiry = $5,
        selected_calendar_id = $6,
        selected_calendar_name = $7,
        discovered_calendars_json = $8,
        sync_mode = 'bidirectional',
        oauth_state = NULL,
        oauth_state_expires_at = NULL,
        last_tested_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      row.id,
      accountEmail,
      accessTokenToStore ? encryptSecret(accessTokenToStore, deps.configEncryptionKey) : null,
      encryptSecret(refreshTokenToStore, deps.configEncryptionKey),
      tokenResult.tokens.expiry_date
        ? new Date(tokenResult.tokens.expiry_date).toISOString()
        : null,
      ensured.defaultCalendar.id,
      ensured.defaultCalendar.name,
      JSON.stringify(ensured.calendars)
    ]
  );

  deps.logger?.log?.(`[google-connector] Conta Google ligada: ${accountEmail}`);

  return {
    accountEmail,
    calendars: ensured.calendars,
    defaultCalendar: ensured.defaultCalendar
  };
}
export async function syncSingleEventToGoogle(
  deps: GoogleSyncDependencies,
  eventId: string
): Promise<void> {
  try {
    const localEvent = await getStoredEventById(deps.eventPool, eventId, false);
    if (!localEvent || localEvent.deletedAt || !localEvent.sourceUserId) {
      return;
    }

    const connection = await getEnabledGoogleConnectionForDiscordUser(
      deps,
      localEvent.sourceUserId
    );
    if (!connection) {
      return;
    }

    const { calendarApi, calendars } = await createGoogleCalendarClient(deps, connection);
    const target = await resolveTargetCalendarForEvent(
      calendarApi,
      connection,
      localEvent,
      calendars,
      deps.timezone
    );
    const existingLink = await getGoogleLinkByEventId(deps.eventPool, eventId);

    if (
      existingLink?.remoteCalendarId &&
      existingLink.remoteCalendarId !== target.calendar.id &&
      existingLink.remoteId
    ) {
      await deleteRemoteGoogleEvent(
        calendarApi,
        existingLink.remoteCalendarId,
        existingLink.remoteId
      ).catch(() => undefined);
    }

    let remoteId = existingLink?.remoteId ?? null;
    let remoteEtag: string | null = null;
    let remoteUid: string | null = null;
    const requestBody = buildGoogleEventRequest(localEvent, deps.timezone);

    if (
      existingLink &&
      existingLink.remoteCalendarId === target.calendar.id &&
      existingLink.remoteId
    ) {
      const updated = await calendarApi.events.update({
        calendarId: target.calendar.id,
        eventId: existingLink.remoteId,
        requestBody
      });
      remoteId = updated.data.id ?? existingLink.remoteId;
      remoteEtag = updated.data.etag ?? null;
      remoteUid = updated.data.iCalUID ?? null;
    } else {
      const inserted = await calendarApi.events.insert({
        calendarId: target.calendar.id,
        requestBody
      });
      remoteId = inserted.data.id ?? null;
      remoteEtag = inserted.data.etag ?? null;
      remoteUid = inserted.data.iCalUID ?? null;
    }

    if (!remoteId) {
      throw new Error("O Google não devolveu o ID do evento sincronizado.");
    }

    await upsertGoogleProviderLink(deps.eventPool, {
      eventId: localEvent.pageId,
      remoteId,
      remoteUid,
      remoteEtag,
      remoteCalendarId: target.calendar.id,
      remoteCalendarName: target.calendar.name,
      lastError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setGoogleLinkErrorByEventId(deps.eventPool, eventId, message);
    throw error;
  }
}

export async function deleteSingleEventFromGoogle(
  deps: GoogleSyncDependencies,
  eventId: string
): Promise<void> {
  const localEvent = await getStoredEventById(deps.eventPool, eventId, true);
  if (!localEvent?.sourceUserId) {
    return;
  }

  const connection = await getEnabledGoogleConnectionForDiscordUser(deps, localEvent.sourceUserId);
  if (!connection) {
    return;
  }

  const link = await getGoogleLinkByEventId(deps.eventPool, eventId);
  if (!link?.remoteId || !link.remoteCalendarId) {
    return;
  }

  const { calendarApi } = await createGoogleCalendarClient(deps, connection);
  await deleteRemoteGoogleEvent(calendarApi, link.remoteCalendarId, link.remoteId).catch(
    () => undefined
  );
  await deleteGoogleProviderLinkByEventId(deps.eventPool, eventId);
}

export async function syncGoogleCalendarNow(
  deps: GoogleSyncDependencies,
  userId?: string
): Promise<GoogleSyncSummary> {
  if (userId) {
    return syncGoogleCalendarForUser(deps, userId);
  }

  const userIds = await listEnabledGoogleConnectionUserIds(deps.configPool);
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
      message: "Google Calendar não está ligado.",
      lastError: null
    };
  }

  if (userIds.length === 1) {
    return syncGoogleCalendarForUser(deps, userIds[0]);
  }

  const aggregate: GoogleSyncSummary = {
    success: true,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Google concluída.",
    lastError: null
  };

  for (const userId of userIds) {
    const result = await syncGoogleCalendarForUser(deps, userId);
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

export async function syncGoogleCalendarForUser(
  deps: GoogleSyncDependencies,
  userId: string
): Promise<GoogleSyncSummary> {
  const summary: GoogleSyncSummary = {
    success: true,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Google concluída.",
    lastError: null
  };

  try {
    const connection = await getEnabledGoogleConnection(deps, { userId });
    if (!connection) {
      return {
        ...summary,
        success: false,
        message: "Google Calendar não está ligado."
      };
    }

    const runtimeLink = await getDashboardRuntimeLink(deps.configPool, userId);
    const { calendarApi, calendars } = await createGoogleCalendarClient(deps, connection);
    const defaultCalendar = await resolveDefaultGoogleCalendar(
      calendarApi,
      connection,
      calendars,
      deps.timezone
    );
    const managedCalendars = getManagedCalendars(defaultCalendar.calendars, connection);
    const allLinks = await getAllGoogleLinks(deps.eventPool);
    const linkedEvents = await getAllStoredEventsByIds(
      deps.eventPool,
      allLinks.map((link) => link.eventId)
    );
    const allowedEventIds = new Set(
      filterEventsForRuntimeUser(linkedEvents, runtimeLink).map((event) => event.pageId)
    );
    const links = allLinks.filter((link) => allowedEventIds.has(link.eventId));
    const linksByRemoteId = new Map(links.map((link) => [link.remoteId, link]));
    const processedLocalIds = new Set<string>();

    for (const calendar of managedCalendars) {
      const remoteEvents = await listGoogleRemoteEvents(calendarApi, calendar);

      for (const remoteEvent of remoteEvents) {
        const existingLink = linksByRemoteId.get(remoteEvent.remoteId) ?? null;
        const linkLocal = existingLink
          ? await getStoredEventById(deps.eventPool, existingLink.eventId, true)
          : null;
        const pulseEventLocal = remoteEvent.pulseEventId
          ? await getStoredEventById(deps.eventPool, remoteEvent.pulseEventId, true)
          : null;
        const existingLocal = filterSingleEventForRuntimeUser(
          linkLocal ?? pulseEventLocal,
          runtimeLink
        );

        if (remoteEvent.status === "cancelled") {
          if (existingLink && existingLocal && shouldTreatMissingRemoteAsDeletion(existingLocal, existingLink)) {
            await softDeleteStoredEvent(deps.eventPool, existingLocal.pageId);
            await deleteGoogleProviderLinkByEventId(deps.eventPool, existingLocal.pageId);
            await notifyProvidersAfterRemoteSync(deps, existingLocal.pageId, true);
            summary.deletedLocal += 1;
          } else {
            summary.skipped += 1;
          }
          continue;
        }

        const localEventId =
          existingLink?.eventId ??
          existingLocal?.pageId ??
          (await insertStoredEventFromRemote(deps, remoteEvent, runtimeLink));
        const localBeforeApply =
          existingLocal ??
          (await getStoredEventById(deps.eventPool, localEventId, true));

        if (!existingLink && !existingLocal) {
          summary.importedLocal += 1;
        }

        const driftedAfterProviderSync =
          existingLink?.lastSyncedAt && localBeforeApply
            ? await hasNewerNonGoogleProviderSync(deps.eventPool, localEventId, existingLink.lastSyncedAt)
            : false;

        if (
          existingLink &&
          localBeforeApply &&
          hasLocalChangedSinceLastSync(localBeforeApply, existingLink) &&
          !hasRemoteChangedSinceLastSync(remoteEvent, existingLink) &&
          !driftedAfterProviderSync
        ) {
          processedLocalIds.add(localBeforeApply.pageId);
          summary.skipped += 1;
          continue;
        }

        if (
          !localBeforeApply ||
          !existingLink ||
          hasRemoteChangedSinceLastSync(remoteEvent, existingLink) ||
          !eventsAreEquivalent(localBeforeApply, remoteEvent)
        ) {
          await applyRemoteEventToLocal(
            deps,
            remoteEvent,
            localEventId,
            runtimeLink,
            localBeforeApply
          );
          if (existingLink && localBeforeApply) {
            summary.updatedLocal += 1;
          }
          await notifyProvidersAfterRemoteSync(deps, localEventId, false);
        }

        await upsertGoogleProviderLink(deps.eventPool, {
          eventId: localEventId,
          remoteId: remoteEvent.remoteId,
          remoteUid: remoteEvent.remoteUid,
          remoteEtag: remoteEvent.remoteEtag,
          remoteCalendarId: remoteEvent.remoteCalendarId,
          remoteCalendarName: remoteEvent.remoteCalendarName,
          lastError: null
        });

        processedLocalIds.add(localEventId);
      }
    }

    const localLinks = (await getAllGoogleLinks(deps.eventPool)).filter((link) =>
      allowedEventIds.has(link.eventId)
    );
    const localEvents = await getAllStoredEventsByIds(
      deps.eventPool,
      localLinks.map((link) => link.eventId)
    );
    const scopedLocalEvents = filterEventsForRuntimeUser(localEvents, runtimeLink);
    const localById = new Map(scopedLocalEvents.map((event) => [event.pageId, event]));

    for (const link of localLinks) {
      const localEvent = localById.get(link.eventId);
      if (!localEvent) {
        continue;
      }

      if (localEvent.deletedAt) {
        await deleteSingleEventFromGoogle(deps, localEvent.pageId);
        summary.deletedRemote += 1;
        continue;
      }

      if (processedLocalIds.has(localEvent.pageId)) {
        continue;
      }

      if (hasLocalChangedSinceLastSync(localEvent, link)) {
        await syncSingleEventToGoogle(deps, localEvent.pageId);
        summary.updatedRemote += 1;
      }
    }

    const unsyncedLocal = filterEventsForRuntimeUser(
      await getActiveStoredEventsWithoutGoogleLink(deps.eventPool),
      runtimeLink
    );
    for (const event of unsyncedLocal) {
      await syncSingleEventToGoogle(deps, event.pageId);
      summary.createdRemote += 1;
    }

    await updateGoogleConnectionSyncStatus(deps.configPool, userId, null, true);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateGoogleConnectionSyncStatus(deps.configPool, userId, message, false);
    return {
      ...summary,
      success: false,
      message,
      lastError: message
    };
  }
}

function ensureGoogleOAuthConfig(
  deps: Pick<GoogleSyncDependencies, "googleClientId" | "googleClientSecret" | "googleRedirectUri">
): void {
  const missing: string[] = [];
  if (!deps.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!deps.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!deps.googleRedirectUri) missing.push("GOOGLE_REDIRECT_URI");
  if (missing.length > 0) {
    throw new Error(`Falta configurar ${missing.join(", ")} para ligar o Google Calendar.`);
  }
}

function createGoogleOAuthClient(
  deps: Pick<GoogleSyncDependencies, "googleClientId" | "googleClientSecret" | "googleRedirectUri">
) {
  return new google.auth.OAuth2(
    deps.googleClientId,
    deps.googleClientSecret,
    deps.googleRedirectUri
  );
}

async function createGoogleCalendarClient(
  deps: Pick<
    GoogleSyncDependencies,
    | "configPool"
    | "configEncryptionKey"
    | "googleClientId"
    | "googleClientSecret"
    | "googleRedirectUri"
  >,
  connection: GoogleConnection
): Promise<{ calendarApi: calendar_v3.Calendar; calendars: GoogleCalendarOption[] }> {
  const oauth2Client = createGoogleOAuthClient(deps);
  oauth2Client.setCredentials({
    access_token: connection.accessToken ?? undefined,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry ? new Date(connection.tokenExpiry).getTime() : undefined
  });

  const refreshed = await oauth2Client.getAccessToken();
  const credentials = oauth2Client.credentials;

  if (refreshed.token && credentials.access_token !== connection.accessToken) {
    await persistGoogleTokens(deps.configPool, connection.id, deps.configEncryptionKey, {
      accessToken: refreshed.token,
      refreshToken: credentials.refresh_token ?? connection.refreshToken,
      expiryDate: credentials.expiry_date ?? null
    });
  }

  const calendarApi = google.calendar({ version: "v3", auth: oauth2Client });
  const calendars = await listGoogleCalendarOptions(calendarApi);

  return { calendarApi, calendars };
}

async function persistGoogleTokens(
  configPool: Pool,
  id: string,
  encryptionKey: string,
  input: { accessToken: string | null; refreshToken: string; expiryDate: number | null }
): Promise<void> {
  await configPool.query(
    `
      UPDATE google_calendar_connections
      SET
        access_token_encrypted = $2,
        refresh_token_encrypted = $3,
        token_expiry = $4,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      input.accessToken ? encryptSecret(input.accessToken, encryptionKey) : null,
      encryptSecret(input.refreshToken, encryptionKey),
      input.expiryDate ? new Date(input.expiryDate).toISOString() : null
    ]
  );
}
async function getRawGoogleConnectionRow(
  configPool: Pool,
  userId: string
): Promise<GoogleCalendarConnectionRow | null> {
  const result = await configPool.query<GoogleCalendarConnectionRow>(
    `
      SELECT *
      FROM google_calendar_connections
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function ensureGoogleConnectionRow(configPool: Pool, userId: string): Promise<{ id: string }> {
  const existing = await getRawGoogleConnectionRow(configPool, userId);
  if (existing) {
    return { id: existing.id };
  }

  const id = randomUUID();
  await configPool.query(
    `
      INSERT INTO google_calendar_connections (id, user_id, enabled, sync_mode)
      VALUES ($1, $2, FALSE, 'bidirectional')
    `,
    [id, userId]
  );

  return { id };
}

async function getEnabledGoogleConnection(
  deps: Pick<GoogleSyncDependencies, "configPool" | "configEncryptionKey">,
  input: { userId: string }
): Promise<GoogleConnection | null> {
  const row = await getRawGoogleConnectionRow(deps.configPool, input.userId);
  if (!row || !row.enabled || !row.account_email || !row.refresh_token_encrypted) {
    return null;
  }

  if (!deps.configEncryptionKey) {
    throw new Error("CONFIG_ENCRYPTION_KEY não está definida para ler a configuração Google.");
  }

  return {
    id: row.id,
    userId: input.userId,
    enabled: row.enabled,
    accountEmail: row.account_email,
    accessToken: decryptNullableSecret(row.access_token_encrypted, deps.configEncryptionKey),
    refreshToken: decryptSecret(row.refresh_token_encrypted, deps.configEncryptionKey),
    tokenExpiry: row.token_expiry?.toISOString() ?? null,
    defaultCalendarId: row.selected_calendar_id,
    defaultCalendarName: row.selected_calendar_name,
    syncMode: row.sync_mode || "bidirectional",
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    lastError: row.last_error
  };
}

async function getEnabledGoogleConnectionForDiscordUser(
  deps: Pick<GoogleSyncDependencies, "configPool" | "configEncryptionKey">,
  discordUserId: string
): Promise<GoogleConnection | null> {
  const result = await deps.configPool.query<GoogleCalendarConnectionRow>(
    `
      SELECT gc.*
      FROM google_calendar_connections gc
      JOIN dashboard_runtime_settings drs
        ON drs.user_id = gc.user_id
      WHERE gc.enabled = TRUE
        AND gc.account_email IS NOT NULL
        AND gc.refresh_token_encrypted IS NOT NULL
        AND drs.linked_discord_user_id = $1
      ORDER BY gc.updated_at DESC
      LIMIT 1
    `,
    [discordUserId]
  );

  const row = result.rows[0];
  if (!row || !row.user_id) {
    return null;
  }

  return getEnabledGoogleConnection(deps, { userId: row.user_id });
}

async function listEnabledGoogleConnectionUserIds(configPool: Pool): Promise<string[]> {
  const result = await configPool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM google_calendar_connections
      WHERE enabled = TRUE
        AND user_id IS NOT NULL
      ORDER BY updated_at DESC
    `
  );

  return [...new Set(result.rows.map((row) => row.user_id).filter(Boolean))];
}

async function listGoogleCalendarOptions(
  calendarApi: calendar_v3.Calendar
): Promise<GoogleCalendarOption[]> {
  const items: GoogleCalendarOption[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendarApi.calendarList.list({
      maxResults: 250,
      pageToken
    });

    for (const item of response.data.items ?? []) {
      if (!item.id) {
        continue;
      }

      items.push({
        id: item.id,
        name: item.summaryOverride || item.summary || item.id,
        description: item.description ?? null,
        timezone: item.timeZone ?? null,
        primary: item.primary === true
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return items;
}

function isReminderCalendarName(name: string | null | undefined): boolean {
  const normalized = normalizeLooseText(name);
  return ["lembretes", "reminders", "reminder"].includes(normalized);
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

function getPreferredMappedCalendarName(
  categoryOrCalendarName: string | null | undefined,
  calendars: GoogleCalendarOption[],
  fallbackName: string
): string | null {
  const normalized = normalizeLooseText(categoryOrCalendarName ?? "");
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
      !isExcludedAutomaticCalendarName(calendar.name) &&
      normalizeLooseText(calendar.name) === normalizeLooseText(preferredName)
  );

  return existingPreferred ? existingPreferred.name : fallbackName;
}

function findGoogleCalendarByIdOrName(
  calendars: GoogleCalendarOption[],
  calendarId: string | null | undefined,
  calendarName: string | null | undefined
): GoogleCalendarOption | null {
  return (
    calendars.find((calendar) => calendarId && calendar.id === calendarId) ??
    calendars.find(
      (calendar) =>
        calendarName && normalizeLooseText(calendar.name) === normalizeLooseText(calendarName)
    ) ??
    null
  );
}

function buildDesiredCalendarName(
  event: LocalCalendarEvent,
  fallbackName: string,
  calendars: GoogleCalendarOption[]
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

async function ensureDefaultGoogleCalendar(
  calendarApi: calendar_v3.Calendar,
  fallbackTimeZone: string
): Promise<{ defaultCalendar: GoogleCalendarOption; calendars: GoogleCalendarOption[] }> {
  const calendars = await listGoogleCalendarOptions(calendarApi);
  const existing = calendars.find(
    (calendar) =>
      !isExcludedAutomaticCalendarName(calendar.name) &&
      ["outros", "other"].includes(normalizeLooseText(calendar.name))
  );

  if (existing) {
    return { defaultCalendar: existing, calendars };
  }

  const created = await calendarApi.calendars.insert({
    requestBody: {
      summary: "Outros",
      description: "Pulse - Outros",
      timeZone: fallbackTimeZone
    }
  });

  const calendarsAfterCreate = await listGoogleCalendarOptions(calendarApi);
  const createdCalendar =
    calendarsAfterCreate.find((calendar) => calendar.id === created.data.id) ??
    calendarsAfterCreate.find((calendar) => normalizeLooseText(calendar.name) === "outros");

  if (!createdCalendar) {
    throw new Error("O calendário Google 'Outros' foi criado mas não apareceu na listagem seguinte.");
  }

  return {
    defaultCalendar: createdCalendar,
    calendars: calendarsAfterCreate
  };
}

async function resolveDefaultGoogleCalendar(
  calendarApi: calendar_v3.Calendar,
  connection: GoogleConnection,
  existingCalendars: GoogleCalendarOption[] | undefined,
  fallbackTimeZone: string
): Promise<{ calendar: GoogleCalendarOption; calendars: GoogleCalendarOption[] }> {
  const calendars = existingCalendars ?? (await listGoogleCalendarOptions(calendarApi));
  const preferred = findGoogleCalendarByIdOrName(
    calendars,
    connection.defaultCalendarId,
    connection.defaultCalendarName
  );

  if (preferred && !isReminderCalendarName(preferred.name)) {
    return { calendar: preferred, calendars };
  }

  const ensured = await ensureDefaultGoogleCalendar(calendarApi, fallbackTimeZone);
  return { calendar: ensured.defaultCalendar, calendars: ensured.calendars };
}

async function resolveTargetCalendarForEvent(
  calendarApi: calendar_v3.Calendar,
  connection: GoogleConnection,
  event: LocalCalendarEvent,
  existingCalendars: GoogleCalendarOption[] | undefined,
  fallbackTimeZone: string
): Promise<{ calendar: GoogleCalendarOption; calendars: GoogleCalendarOption[] }> {
  const fallback = await resolveDefaultGoogleCalendar(
    calendarApi,
    connection,
    existingCalendars,
    fallbackTimeZone
  );
  const desiredName = buildDesiredCalendarName(event, fallback.calendar.name, fallback.calendars);

  if (normalizeLooseText(desiredName) === normalizeLooseText(fallback.calendar.name)) {
    return fallback;
  }

  const matching = fallback.calendars.find(
    (calendar) =>
      !isExcludedAutomaticCalendarName(calendar.name) &&
      normalizeLooseText(calendar.name) === normalizeLooseText(desiredName)
  );

  if (matching) {
    return { calendar: matching, calendars: fallback.calendars };
  }

  const created = await calendarApi.calendars.insert({
    requestBody: {
      summary: desiredName,
      description: `Pulse - ${desiredName}`,
      timeZone: fallbackTimeZone
    }
  });

  const calendarsAfterCreate = await listGoogleCalendarOptions(calendarApi);
  const createdCalendar =
    calendarsAfterCreate.find((calendar) => calendar.id === created.data.id) ??
    calendarsAfterCreate.find(
      (calendar) => normalizeLooseText(calendar.name) === normalizeLooseText(desiredName)
    );

  if (!createdCalendar) {
    throw new Error(`O calendário Google '${desiredName}' foi criado mas não apareceu na listagem seguinte.`);
  }

  return { calendar: createdCalendar, calendars: calendarsAfterCreate };
}

function getManagedCalendars(
  calendars: GoogleCalendarOption[],
  connection: GoogleConnection
): GoogleCalendarOption[] {
  const fallbackNames = new Set([
    normalizeLooseText(connection.defaultCalendarName ?? "Outros"),
    "outros",
    "other"
  ]);

  return calendars.filter((calendar) => {
    if (isExcludedAutomaticCalendarName(calendar.name)) {
      return false;
    }

    const normalized = normalizeLooseText(calendar.name);
    if (fallbackNames.has(normalized)) {
      return true;
    }

    return normalized.length > 0;
  });
}

function buildGoogleEventRequest(
  event: LocalCalendarEvent,
  fallbackTimeZone: string
): calendar_v3.Schema$Event {
  const timezone = event.timezone || fallbackTimeZone;

  if (event.allDay) {
    return {
      summary: event.title,
      description: event.description ?? undefined,
      start: { date: event.date },
      end: { date: addDays(event.endDate ?? event.date, 1) },
      extendedProperties: {
        private: {
          pulseEventId: event.pageId,
          pulseCategory: event.category ?? "Outros",
          pulseSource: "pulse"
        }
      }
    };
  }

  const startDateTime = `${event.date}T${event.startTime ?? "00:00"}:00`;
  const endDate =
    event.endDate ??
    (shouldRollTimedEventToNextDay(event.startTime, event.endTime) ? addDays(event.date, 1) : event.date);
  const endDateTime = `${endDate}T${event.endTime ?? event.startTime ?? "00:00"}:00`;

  return {
    summary: event.title,
    description: event.description ?? undefined,
    start: {
      dateTime: startDateTime,
      timeZone: timezone
    },
    end: {
      dateTime: endDateTime,
      timeZone: timezone
    },
    extendedProperties: {
      private: {
        pulseEventId: event.pageId,
        pulseCategory: event.category ?? "Outros",
        pulseSource: "pulse"
      }
    }
  };
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

async function listGoogleRemoteEvents(
  calendarApi: calendar_v3.Calendar,
  calendar: GoogleCalendarOption
): Promise<GoogleRemoteEvent[]> {
  const events: GoogleRemoteEvent[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendarApi.events.list({
      calendarId: calendar.id,
      pageToken,
      maxResults: 2500,
      showDeleted: true,
      singleEvents: false
    });

    for (const item of response.data.items ?? []) {
      const parsed = parseGoogleRemoteEvent(item, calendar);
      if (parsed) {
        events.push(parsed);
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}
function parseGoogleRemoteEvent(
  item: calendar_v3.Schema$Event,
  calendar: GoogleCalendarOption
): GoogleRemoteEvent | null {
  if (!item.id) {
    return null;
  }

  const title = (item.summary ?? "Evento Google").trim() || "Evento Google";
  const description = item.description?.trim() || undefined;
  const timezone =
    item.start?.timeZone || item.end?.timeZone || calendar.timezone || "Europe/Lisbon";

  if (item.start?.date) {
    const date = item.start.date;
    const endExclusive = item.end?.date ?? date;
    const inclusiveEnd = addDays(endExclusive, -1);

    return {
      remoteId: item.id,
      remoteUid: item.iCalUID ?? null,
      remoteEtag: item.etag ?? null,
      remoteCalendarId: calendar.id,
      remoteCalendarName: calendar.name,
      title,
      description,
      date,
      endDate: inclusiveEnd !== date ? inclusiveEnd : undefined,
      allDay: true,
      timezone,
      status: item.status ?? "confirmed",
      updatedAt: item.updated ?? null,
      pulseEventId: item.extendedProperties?.private?.pulseEventId ?? null
    };
  }

  if (!item.start?.dateTime) {
    return null;
  }

  const startDate = new Date(item.start.dateTime);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const endDate = item.end?.dateTime ? new Date(item.end.dateTime) : startDate;
  const date = formatDateInTimeZone(startDate, timezone);
  const endDateLabel = formatDateInTimeZone(endDate, timezone);

  return {
    remoteId: item.id,
    remoteUid: item.iCalUID ?? null,
    remoteEtag: item.etag ?? null,
    remoteCalendarId: calendar.id,
    remoteCalendarName: calendar.name,
    title,
    description,
    date,
    endDate: endDateLabel !== date ? endDateLabel : undefined,
    startTime: formatTimeInTimeZone(startDate, timezone),
    endTime: formatTimeInTimeZone(endDate, timezone),
    allDay: false,
    timezone,
    status: item.status ?? "confirmed",
    updatedAt: item.updated ?? null,
    pulseEventId: item.extendedProperties?.private?.pulseEventId ?? null
  };
}

async function deleteRemoteGoogleEvent(
  calendarApi: calendar_v3.Calendar,
  calendarId: string,
  eventId: string
): Promise<void> {
  await calendarApi.events.delete({
    calendarId,
    eventId
  });
}

async function getGoogleLinkByEventId(
  eventPool: Pool,
  eventId: string
): Promise<GoogleProviderLink | null> {
  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_provider_links
      WHERE provider = $1
        AND event_id = $2
      LIMIT 1
    `,
    [GOOGLE_PROVIDER, eventId]
  );

  return result.rows[0] ? mapGoogleProviderLink(result.rows[0] as Record<string, unknown>) : null;
}

async function getAllGoogleLinks(eventPool: Pool): Promise<GoogleProviderLink[]> {
  const result = await eventPool.query(
    `
      SELECT *
      FROM calendar_provider_links
      WHERE provider = $1
    `,
    [GOOGLE_PROVIDER]
  );

  return result.rows.map((row) => mapGoogleProviderLink(row as Record<string, unknown>));
}

async function upsertGoogleProviderLink(
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
      GOOGLE_PROVIDER,
      input.remoteId,
      input.remoteUid,
      input.remoteEtag,
      input.remoteCalendarId,
      input.remoteCalendarName,
      input.lastError
    ]
  );
}

async function deleteGoogleProviderLinkByEventId(
  eventPool: Pool,
  eventId: string
): Promise<void> {
  await eventPool.query(`DELETE FROM calendar_provider_links WHERE provider = $1 AND event_id = $2`, [
    GOOGLE_PROVIDER,
    eventId
  ]);
}

async function setGoogleLinkErrorByEventId(
  eventPool: Pool,
  eventId: string,
  lastError: string
): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_provider_links
      SET last_error = $3,
          updated_at = NOW()
      WHERE provider = $1
        AND event_id = $2
    `,
    [GOOGLE_PROVIDER, eventId, lastError]
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

async function getAllStoredEventsByIds(
  eventPool: Pool,
  ids: string[]
): Promise<LocalCalendarEvent[]> {
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

async function getActiveStoredEventsWithoutGoogleLink(
  eventPool: Pool
): Promise<LocalCalendarEvent[]> {
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
    [GOOGLE_PROVIDER]
  );

  return result.rows.map((row) => mapStoredEvent(row as Record<string, unknown>));
}

async function softDeleteStoredEvent(eventPool: Pool, eventId: string): Promise<void> {
  await eventPool.query(
    `
      UPDATE calendar_events
      SET deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [eventId]
  );
}

async function insertStoredEventFromRemote(
  deps: GoogleSyncDependencies,
  remoteEvent: GoogleRemoteEvent,
  runtimeLink: DashboardRuntimeLink | null
): Promise<string> {
  const eventId = remoteEvent.pulseEventId ?? randomUUID();

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
      ON CONFLICT (id) DO NOTHING
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
      deps.resolveCategoryLabel(
        remoteEvent.title,
        remoteEvent.description,
        remoteEvent.remoteCalendarName
      ),
      "google-calendar",
      runtimeLink?.conversationChannelId ?? null,
      runtimeLink?.linkedDiscordUserId ?? null,
      runtimeLink?.linkedDiscordUsername ?? null,
      remoteEvent.timezone
    ]
  );

  return eventId;
}
async function applyRemoteEventToLocal(
  deps: GoogleSyncDependencies,
  remoteEvent: GoogleRemoteEvent,
  localEventId: string,
  runtimeLink: DashboardRuntimeLink | null,
  existingLocalEvent: LocalCalendarEvent | null
): Promise<void> {
  const sourceName = existingLocalEvent?.sourceName ?? "google-calendar";
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
        existingLocalEvent?.category ?? remoteEvent.remoteCalendarName
      ),
      sourceName,
      sourceChannelId,
      sourceUserId,
      sourceUsername,
      remoteEvent.timezone
    ]
  );
}

async function updateGoogleConnectionSyncStatus(
  configPool: Pool,
  userId: string,
  lastError: string | null,
  success: boolean
): Promise<void> {
  await configPool.query(
    `
      UPDATE google_calendar_connections
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
        SELECT linked_discord_user_id, linked_discord_username, conversation_channel_id
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

function filterSingleEventForRuntimeUser(
  event: LocalCalendarEvent | null,
  runtimeLink: DashboardRuntimeLink | null
): LocalCalendarEvent | null {
  if (!event) {
    return null;
  }

  const linkedDiscordUserId = runtimeLink?.linkedDiscordUserId ?? null;
  if (!linkedDiscordUserId) {
    return null;
  }

  return event.sourceUserId === linkedDiscordUserId ? event : null;
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
    sourceChannelId:
      typeof row.source_channel_id === "string" ? row.source_channel_id : undefined,
    sourceUserId: typeof row.source_user_id === "string" ? row.source_user_id : undefined,
    sourceUsername:
      typeof row.source_username === "string" ? row.source_username : undefined,
    sourceMessageId:
      typeof row.source_message_id === "string" ? row.source_message_id : undefined,
    timezone: typeof row.timezone === "string" ? row.timezone : undefined,
    rawDate: typeof row.raw_date === "string" ? row.raw_date : undefined,
    deletedAt: asIsoString(row.deleted_at) ?? undefined,
    updatedAt: asIsoString(row.updated_at) ?? undefined,
    createdAt: asIsoString(row.created_at) ?? undefined
  };
}

function mapGoogleProviderLink(row: Record<string, unknown>): GoogleProviderLink {
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
  link: GoogleProviderLink
): boolean {
  if (!link.lastSyncedAt || !localEvent.updatedAt) {
    return false;
  }

  return toEpoch(localEvent.updatedAt) <= toEpoch(link.lastSyncedAt);
}

function hasLocalChangedSinceLastSync(
  localEvent: LocalCalendarEvent,
  link: GoogleProviderLink
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
  remoteEvent: GoogleRemoteEvent,
  link: GoogleProviderLink
): boolean {
  if (remoteEvent.updatedAt && link.lastSyncedAt) {
    return toEpoch(remoteEvent.updatedAt) > toEpoch(link.lastSyncedAt);
  }

  if (!remoteEvent.remoteEtag) {
    return false;
  }

  return remoteEvent.remoteEtag !== link.remoteEtag;
}

async function hasNewerNonGoogleProviderSync(
  eventPool: Pool,
  eventId: string,
  googleLastSyncedAt: string
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
    [eventId, GOOGLE_PROVIDER, googleLastSyncedAt]
  );

  return result.rows[0]?.newer_exists === true;
}

async function notifyProvidersAfterRemoteSync(
  deps: GoogleSyncDependencies,
  eventId: string,
  deleted: boolean
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (deleted) {
    if (deps.notifyAppleEventDelete) {
      tasks.push(
        deps.notifyAppleEventDelete(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[google-connector] Nao consegui propagar delete para Apple (${eventId}): ${
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
            `[google-connector] Nao consegui propagar delete para Notion (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
  } else {
    if (deps.notifyAppleEventSync) {
      tasks.push(
        deps.notifyAppleEventSync(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[google-connector] Nao consegui propagar update para Apple (${eventId}): ${
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
            `[google-connector] Nao consegui propagar update para Notion (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
  }

  await Promise.all(tasks);
}

function eventsAreEquivalent(
  localEvent: LocalCalendarEvent,
  remoteEvent: GoogleRemoteEvent
): boolean {
  return (
    normalizeLooseText(localEvent.title) === normalizeLooseText(remoteEvent.title) &&
    normalizeLooseText(localEvent.description ?? "") ===
      normalizeLooseText(remoteEvent.description ?? "") &&
    localEvent.date === remoteEvent.date &&
    (localEvent.endDate ?? "") === (remoteEvent.endDate ?? "") &&
    (localEvent.startTime ?? "") === (remoteEvent.startTime ?? "") &&
    (localEvent.endTime ?? "") === (remoteEvent.endTime ?? "") &&
    Boolean(localEvent.allDay) === Boolean(remoteEvent.allDay)
  );
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

  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return null;
}

function formatDateInTimeZone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function formatTimeInTimeZone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("pt-PT", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  return formatter.format(date);
}

function addDays(isoDate: string, delta: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function normalizeLooseText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function toEpoch(value: string): number {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function encryptSecret(value: string, secret: string): string {
  const key = createHash("sha256").update(secret).digest();
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

function decryptSecret(ciphertext: string, secret: string): string {
  const [ivPart, tagPart, contentPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !contentPart) {
    throw new Error("O segredo Google guardado está inválido.");
  }

  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(contentPart, "base64url")),
    decipher.final()
  ]).toString("utf-8");
}

function decryptNullableSecret(
  ciphertext: string | null | undefined,
  secret: string
): string | null {
  if (!ciphertext) {
    return null;
  }

  return decryptSecret(ciphertext, secret);
}


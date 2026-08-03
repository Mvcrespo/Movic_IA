
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
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

export type NotionAuthUrlResult = { url: string; state: string };
export type NotionConnectionExchangeResult = {
  workspaceName: string | null;
  workspaceId: string | null;
  databaseId: string;
  databaseUrl: string | null;
};
export type NotionSyncSummary = {
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
export type NotionWebhookResult = { success: boolean; message: string; syncTriggered: boolean };
type NotionWebhookPayload = {
  verification_token?: unknown;
  workspace_id?: unknown;
  integration_id?: unknown;
};
export type NotionConnectionSummary = {
  enabled: boolean;
  workspaceName: string | null;
  workspaceId: string | null;
  workspaceIcon: string | null;
  databaseId: string | null;
  databaseUrl: string | null;
  syncMode: string;
  lastSyncAt: string | null;
  lastError: string | null;
};
export type NotionSyncDependencies = {
  eventPool: Pool;
  configPool: Pool;
  timezone: string;
  configEncryptionKey: string;
  notionClientId: string;
  notionClientSecret: string;
  notionRedirectUri: string;
  notionApiVersion: string;
  logger?: Pick<Console, "log" | "warn" | "error">;
  resolveCategoryLabel: (title: string, description?: string, explicitCategory?: string) => string;
  notifyAppleEventSync?: (eventId: string) => Promise<void>;
  notifyAppleEventDelete?: (eventId: string) => Promise<void>;
  notifyGoogleEventSync?: (eventId: string) => Promise<void>;
  notifyGoogleEventDelete?: (eventId: string) => Promise<void>;
};

type NotionConnectionRow = {
  id: string;
  user_id: string | null;
  enabled: boolean;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_icon: string | null;
  access_token_encrypted: string | null;
  bot_id: string | null;
  root_page_id: string | null;
  root_page_url: string | null;
  database_id: string | null;
  database_url: string | null;
  sync_mode: string;
  oauth_state: string | null;
  oauth_state_expires_at: Date | null;
  last_sync_at: Date | null;
  last_error: string | null;
};

type NotionConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceIcon: string | null;
  accessToken: string | null;
  botId: string | null;
  rootPageId: string | null;
  rootPageUrl: string | null;
  databaseId: string | null;
  databaseUrl: string | null;
  syncMode: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type NotionProviderLink = {
  id: string;
  eventId: string;
  remoteId: string;
  remoteEtag: string | null;
  lastSyncedAt: string | null;
};

type DashboardRuntimeLink = {
  linkedDiscordUserId: string | null;
  linkedDiscordUsername: string | null;
  conversationChannelId: string | null;
  // Id canonico a usar como source_user_id ao importar eventos remotos.
  primarySourceUserId: string | null;
  // Todos os ids que pertencem a este utilizador da dashboard (UUID + ids
  // ligados de qualquer plataforma), usados para decidir a quem pertence um evento.
  ownedSourceUserIds: string[];
};

type NotionRemoteEvent = {
  remoteId: string;
  remoteEtag: string | null;
  timezone: string;
  title: string;
  description?: string;
  category?: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  updatedAt: string | null;
  pulseEventId: string | null;
};

type NotionApiPage = {
  id: string;
  url?: string;
  archived?: boolean;
  last_edited_time?: string;
  properties?: Record<string, unknown>;
};

type NotionDatabaseInfo = {
  rootPageId: string;
  rootPageUrl: string | null;
  databaseId: string;
  databaseUrl: string | null;
};

const NOTION_PROVIDER = "notion";
const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_OAUTH_TOKEN_URL = "https://api.notion.com/v1/oauth/token";
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const ROOT_PAGE_TITLE = "Pulse Calendar";
const DATABASE_TITLE = "Pulse Events";
const PROPERTY_TITLE = "Name";
const PROPERTY_DATE = "Date";
const PROPERTY_CATEGORY = "Category";
const PROPERTY_DESCRIPTION = "Description";
const PROPERTY_PULSE_ID = "Pulse ID";
const PROPERTY_ALL_DAY = "All Day";

export async function ensureNotionSyncSchema(deps: Pick<NotionSyncDependencies, "eventPool" | "configPool">): Promise<void> {
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
  await deps.eventPool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_provider_links_provider_event ON calendar_provider_links (provider, event_id)`);
  await deps.eventPool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_provider_links_provider_remote ON calendar_provider_links (provider, remote_id)`);
  await deps.configPool.query(`
    CREATE TABLE IF NOT EXISTS notion_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      workspace_id TEXT NULL,
      workspace_name TEXT NULL,
      workspace_icon TEXT NULL,
      access_token_encrypted TEXT NULL,
      bot_id TEXT NULL,
      root_page_id TEXT NULL,
      root_page_url TEXT NULL,
      database_id TEXT NULL,
      database_url TEXT NULL,
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
  await deps.configPool.query(`ALTER TABLE notion_connections ADD COLUMN IF NOT EXISTS user_id TEXT NULL`);
  await deps.configPool.query(`CREATE INDEX IF NOT EXISTS idx_notion_connections_user ON notion_connections (user_id)`);
}

export async function createNotionAuthUrl(
  deps: Pick<NotionSyncDependencies, "configPool" | "notionClientId" | "notionClientSecret" | "notionRedirectUri">,
  userId: string
): Promise<NotionAuthUrlResult> {
  ensureNotionOAuthConfig(deps);
  const row = await ensureNotionConnectionRow(deps.configPool, userId);
  const state = randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await deps.configPool.query(`UPDATE notion_connections SET oauth_state = $2, oauth_state_expires_at = $3, updated_at = NOW() WHERE id = $1`, [row.id, state, expiresAt.toISOString()]);
  const url = new URL(NOTION_AUTHORIZE_URL);
  url.searchParams.set("client_id", deps.notionClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", deps.notionRedirectUri);
  url.searchParams.set("state", state);
  return { state, url: url.toString() };
}
export async function exchangeNotionAuthorizationCode(
  deps: Pick<NotionSyncDependencies, "configPool" | "configEncryptionKey" | "notionClientId" | "notionClientSecret" | "notionRedirectUri" | "notionApiVersion" | "logger">,
  input: { code: string; state: string },
  userId: string
): Promise<NotionConnectionExchangeResult> {
  ensureNotionOAuthConfig(deps);
  if (!deps.configEncryptionKey) {
    throw new Error("Falta CONFIG_ENCRYPTION_KEY para guardar a ligação Notion com segurança.");
  }

  const row = await getRawNotionConnectionRow(deps.configPool, userId);
  if (!row?.oauth_state || !row.oauth_state_expires_at) {
    throw new Error("Não existe nenhuma ligação Notion pendente na dashboard.");
  }
  if (row.oauth_state !== input.state) {
    throw new Error("O estado OAuth do Notion não coincide com o pedido atual.");
  }
  if (row.oauth_state_expires_at.getTime() <= Date.now()) {
    throw new Error("A ligação Notion expirou. Volta a clicar em ligar Notion.");
  }

  const tokenResponse = await fetch(NOTION_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${deps.notionClientId}:${deps.notionClientSecret}`).toString("base64")}`,
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({ grant_type: "authorization_code", code: input.code, redirect_uri: deps.notionRedirectUri })
  });

  const tokenBody = (await tokenResponse.json().catch(() => null)) as Record<string, unknown> | null;
  if (!tokenResponse.ok || !tokenBody || typeof tokenBody.access_token !== "string") {
    throw new Error(typeof tokenBody?.message === "string" ? tokenBody.message : "Não consegui concluir a ligação ao Notion.");
  }

  const notionApi = createNotionApi(tokenBody.access_token, deps.notionApiVersion);
  const databaseInfo = await ensureNotionWorkspaceSetup(notionApi, {
    existingRootPageId: row.root_page_id,
    existingDatabaseId: row.database_id
  });

  const workspaceId = typeof tokenBody.workspace_id === "string" ? tokenBody.workspace_id : null;
  const workspaceName = typeof tokenBody.workspace_name === "string" ? tokenBody.workspace_name : null;
  const workspaceIcon = typeof tokenBody.workspace_icon === "string" ? tokenBody.workspace_icon : null;
  const botId = typeof tokenBody.bot_id === "string" ? tokenBody.bot_id : null;

  await deps.configPool.query(
    `UPDATE notion_connections
       SET enabled = TRUE,
           workspace_id = $2,
           workspace_name = $3,
           workspace_icon = $4,
           access_token_encrypted = $5,
           bot_id = $6,
           root_page_id = $7,
           root_page_url = $8,
           database_id = $9,
           database_url = $10,
           sync_mode = 'bidirectional',
           oauth_state = NULL,
           oauth_state_expires_at = NULL,
           last_tested_at = NOW(),
           last_error = NULL,
           updated_at = NOW()
     WHERE id = $1`,
    [row.id, workspaceId, workspaceName, workspaceIcon, encryptSecret(tokenBody.access_token, deps.configEncryptionKey), botId, databaseInfo.rootPageId, databaseInfo.rootPageUrl, databaseInfo.databaseId, databaseInfo.databaseUrl]
  );

  deps.logger?.log?.(`[notion-connector] Workspace Notion ligado: ${workspaceName ?? workspaceId ?? "sem nome"}`);

  return { workspaceName, workspaceId, databaseId: databaseInfo.databaseId, databaseUrl: databaseInfo.databaseUrl };
}

export async function getNotionConnectionSummary(
  deps: Pick<NotionSyncDependencies, "configPool" | "configEncryptionKey">,
  userId: string
): Promise<NotionConnectionSummary | null> {
  const connection = await getEnabledNotionConnection(deps, false, userId);
  if (!connection) {
    return null;
  }
  return {
    enabled: connection.enabled,
    workspaceName: connection.workspaceName,
    workspaceId: connection.workspaceId,
    workspaceIcon: connection.workspaceIcon,
    databaseId: connection.databaseId,
    databaseUrl: connection.databaseUrl,
    syncMode: connection.syncMode,
    lastSyncAt: connection.lastSyncAt,
    lastError: connection.lastError
  };
}

export async function disableNotionConnection(
  deps: Pick<NotionSyncDependencies, "configPool">,
  userId: string
): Promise<void> {
  const row = await ensureNotionConnectionRow(deps.configPool, userId);
  await deps.configPool.query(
    `UPDATE notion_connections
       SET enabled = FALSE,
           workspace_id = NULL,
           workspace_name = NULL,
           workspace_icon = NULL,
           access_token_encrypted = NULL,
           bot_id = NULL,
           root_page_id = NULL,
           root_page_url = NULL,
           database_id = NULL,
           database_url = NULL,
           oauth_state = NULL,
           oauth_state_expires_at = NULL,
           last_error = NULL,
           updated_at = NOW()
     WHERE id = $1`,
    [row.id]
  );
}
export async function syncSingleEventToNotion(deps: NotionSyncDependencies, eventId: string): Promise<void> {
  try {
    const localEvent = await getStoredEventById(deps.eventPool, eventId, false);
    if (!localEvent || localEvent.deletedAt || !localEvent.sourceUserId) return;

    const connection = await getEnabledNotionConnectionForDiscordUser(deps, localEvent.sourceUserId);
    if (!connection) return;

    const notionApi = createNotionApi(connection.accessToken ?? "", deps.notionApiVersion);
    const workspace = await ensureNotionWorkspaceSetup(notionApi, {
      existingRootPageId: connection.rootPageId,
      existingDatabaseId: connection.databaseId
    });
    await persistWorkspaceIdsIfNeeded(deps.configPool, connection.id, workspace);

    const existingLink = await getNotionLinkByEventId(deps.eventPool, eventId);
    const requestBody = buildNotionPagePayload(localEvent, workspace.databaseId);
    const remotePage = existingLink?.remoteId
      ? await notionApi.patch<NotionApiPage>(`/pages/${existingLink.remoteId}`, requestBody)
      : await notionApi.post<NotionApiPage>("/pages", requestBody);

    if (!remotePage?.id) throw new Error("O Notion não devolveu o ID da página sincronizada.");

    await upsertNotionProviderLink(deps.eventPool, {
      eventId: localEvent.pageId,
      remoteId: remotePage.id,
      remoteEtag: remotePage.last_edited_time ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setNotionLinkErrorByEventId(deps.eventPool, eventId, message);
    throw error;
  }
}

export async function deleteSingleEventFromNotion(deps: NotionSyncDependencies, eventId: string): Promise<void> {
  const localEvent = await getStoredEventById(deps.eventPool, eventId, true);
  if (!localEvent?.sourceUserId) return;
  const connection = await getEnabledNotionConnectionForDiscordUser(deps, localEvent.sourceUserId);
  if (!connection) return;
  const link = await getNotionLinkByEventId(deps.eventPool, eventId);
  if (!link?.remoteId) return;
  const notionApi = createNotionApi(connection.accessToken ?? "", deps.notionApiVersion);
  await notionApi.patch(`/pages/${link.remoteId}`, { archived: true }).catch(() => undefined);
  await deleteNotionProviderLinkByEventId(deps.eventPool, eventId);
}

export async function syncNotionNow(
  deps: NotionSyncDependencies,
  userId?: string
): Promise<NotionSyncSummary> {
  if (userId) {
    return syncNotionForUser(deps, userId);
  }

  const userIds = await listEnabledNotionConnectionUserIds(deps.configPool);
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
      message: "Notion não está ligado.",
      lastError: null
    };
  }

  const aggregate: NotionSyncSummary = {
    success: true,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Notion concluída.",
    lastError: null
  };

  for (const currentUserId of userIds) {
    const result = await syncNotionForUser(deps, currentUserId);
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

async function syncNotionForUser(
  deps: NotionSyncDependencies,
  userId: string
): Promise<NotionSyncSummary> {
  const summary: NotionSyncSummary = {
    success: true,
    importedLocal: 0,
    updatedLocal: 0,
    deletedLocal: 0,
    createdRemote: 0,
    updatedRemote: 0,
    deletedRemote: 0,
    skipped: 0,
    message: "Sincronização Notion concluída.",
    lastError: null
  };

  try {
    const connection = await getEnabledNotionConnection(deps, true, userId);
    if (!connection) return { ...summary, success: false, message: "Notion não está ligado." };

    const notionApi = createNotionApi(connection.accessToken ?? "", deps.notionApiVersion);
    const workspace = await ensureNotionWorkspaceSetup(notionApi, {
      existingRootPageId: connection.rootPageId,
      existingDatabaseId: connection.databaseId
    });
    await persistWorkspaceIdsIfNeeded(deps.configPool, connection.id, workspace);

    const runtimeLink = await getDashboardRuntimeLink(deps.configPool, userId);
    const remoteEvents = await listNotionRemoteEvents(notionApi, workspace.databaseId, deps.timezone);
    const allLinks = await getAllNotionLinks(deps.eventPool);
    const linkedEvents = await getAllStoredEventsByIds(
      deps.eventPool,
      allLinks.map((link) => link.eventId)
    );
    const allowedEventIds = new Set(
      filterEventsForRuntimeUser(linkedEvents, runtimeLink).map((event) => event.pageId)
    );
    const links = allLinks.filter((link) => allowedEventIds.has(link.eventId));
    const linksByRemoteId = new Map(links.map((link) => [link.remoteId, link]));
    const remoteIds = new Set(remoteEvents.map((event) => event.remoteId));
    const processedLocalIds = new Set<string>();

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

      const localEventId = existingLink?.eventId ?? existingLocal?.pageId ?? (await insertStoredEventFromRemote(deps, remoteEvent, runtimeLink));
      const localBeforeApply = existingLocal ?? (await getStoredEventById(deps.eventPool, localEventId, true));
      const driftedAfterProviderSync =
        existingLink?.lastSyncedAt && localBeforeApply
          ? await hasNewerNonNotionProviderSync(deps.eventPool, localEventId, existingLink.lastSyncedAt)
          : false;

      if (!existingLink && !existingLocal) summary.importedLocal += 1;

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

      const shouldApply = !localBeforeApply || !existingLink || hasRemoteChangedSinceLastSync(remoteEvent, existingLink) || !eventsAreEquivalent(localBeforeApply, remoteEvent);
      if (shouldApply) {
        await applyRemoteEventToLocal(deps, remoteEvent, localEventId, runtimeLink, localBeforeApply);
        if (existingLink && localBeforeApply) summary.updatedLocal += 1;
        await notifyProvidersAfterRemoteSync(deps, localEventId, false);
      }

      await upsertNotionProviderLink(deps.eventPool, {
        eventId: localEventId,
        remoteId: remoteEvent.remoteId,
        remoteEtag: remoteEvent.updatedAt
      });
      processedLocalIds.add(localEventId);
    }
    const localLinks = (await getAllNotionLinks(deps.eventPool)).filter((link) =>
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
      if (!localEvent) continue;

      if (!remoteIds.has(link.remoteId)) {
        if (shouldTreatMissingRemoteAsDeletion(localEvent, link)) {
          await softDeleteStoredEvent(deps.eventPool, localEvent.pageId);
          await deleteNotionProviderLinkByEventId(deps.eventPool, localEvent.pageId);
          await notifyProvidersAfterRemoteSync(deps, localEvent.pageId, true);
          summary.deletedLocal += 1;
        } else {
          summary.skipped += 1;
        }
        continue;
      }

      if (localEvent.deletedAt) {
        await deleteSingleEventFromNotion(deps, localEvent.pageId);
        summary.deletedRemote += 1;
        continue;
      }

      if (processedLocalIds.has(localEvent.pageId)) continue;

      if (hasLocalChangedSinceLastSync(localEvent, link)) {
        await syncSingleEventToNotion(deps, localEvent.pageId);
        summary.updatedRemote += 1;
      }
    }

    const unsyncedLocal = filterEventsForRuntimeUser(
      await getActiveStoredEventsWithoutNotionLink(deps.eventPool),
      runtimeLink
    );
    for (const event of unsyncedLocal) {
      await syncSingleEventToNotion(deps, event.pageId);
      summary.createdRemote += 1;
    }

    await updateNotionConnectionSyncStatus(deps.configPool, userId, null, true);
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateNotionConnectionSyncStatus(deps.configPool, userId, message, false);
    return { ...summary, success: false, message, lastError: message };
  }
}

export async function handleNotionWebhook(
  deps: NotionSyncDependencies,
  rawBody: string,
  _headers: Record<string, string | string[] | undefined>
): Promise<NotionWebhookResult> {
  let payload: NotionWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Webhook payload is not an object.");
    }
    payload = parsed as NotionWebhookPayload;
  } catch {
    throw new Error("Body JSON do webhook Notion inválido.");
  }

  if (typeof payload.verification_token === "string") {
    return {
      success: true,
      message: "Verificação do webhook Notion recebida.",
      syncTriggered: false
    };
  }

  const workspaceId = typeof payload.workspace_id === "string" ? payload.workspace_id : null;
  const integrationId = typeof payload.integration_id === "string" ? payload.integration_id : null;
  if (!workspaceId && !integrationId) {
    throw new Error("Webhook Notion sem workspace_id ou integration_id.");
  }

  const userIds = await listNotionConnectionUserIdsForWebhook(
    deps.configPool,
    workspaceId,
    integrationId
  );
  if (userIds.length === 0) {
    return {
      success: true,
      message: "Webhook Notion recebido sem ligação correspondente.",
      syncTriggered: false
    };
  }

  const summaries: NotionSyncSummary[] = [];
  for (const userId of userIds) {
    summaries.push(await syncNotionNow(deps, userId));
  }

  const syncResult = summaries.reduce<NotionSyncSummary>(
    (total, summary) => ({
      success: total.success && summary.success,
      importedLocal: total.importedLocal + summary.importedLocal,
      updatedLocal: total.updatedLocal + summary.updatedLocal,
      deletedLocal: total.deletedLocal + summary.deletedLocal,
      createdRemote: total.createdRemote + summary.createdRemote,
      updatedRemote: total.updatedRemote + summary.updatedRemote,
      deletedRemote: total.deletedRemote + summary.deletedRemote,
      skipped: total.skipped + summary.skipped,
      message: summary.message,
      lastError: summary.lastError ?? total.lastError
    }),
    {
      success: true,
      importedLocal: 0,
      updatedLocal: 0,
      deletedLocal: 0,
      createdRemote: 0,
      updatedRemote: 0,
      deletedRemote: 0,
      skipped: 0,
      message: "Notion sincronizado.",
      lastError: null
    }
  );

  return {
    success: syncResult.success,
    message: syncResult.success ? "Webhook Notion processado." : syncResult.message,
    syncTriggered: true
  };
}

function ensureNotionOAuthConfig(deps: Pick<NotionSyncDependencies, "notionClientId" | "notionClientSecret" | "notionRedirectUri">): void {
  const missing: string[] = [];
  if (!deps.notionClientId) missing.push("NOTION_CLIENT_ID");
  if (!deps.notionClientSecret) missing.push("NOTION_CLIENT_SECRET");
  if (!deps.notionRedirectUri) missing.push("NOTION_REDIRECT_URI");
  if (missing.length > 0) {
    throw new Error(`Falta configurar ${missing.join(", ")} para ligar o Notion.`);
  }
}

function createNotionApi(accessToken: string, notionApiVersion: string) {
  return {
    async post<T>(path: string, body: unknown): Promise<T> {
      return requestNotion<T>("POST", path, accessToken, notionApiVersion, body);
    },
    async patch<T>(path: string, body: unknown): Promise<T> {
      return requestNotion<T>("PATCH", path, accessToken, notionApiVersion, body);
    }
  };
}

async function requestNotion<T>(method: string, path: string, accessToken: string, notionApiVersion: string, body?: unknown): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=utf-8",
      "Notion-Version": notionApiVersion
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const json = safeJsonParse(text) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof json?.message === "string" ? json.message : `Notion API devolveu HTTP ${response.status}.`);
  }
  return (json ?? {}) as T;
}
async function ensureNotionWorkspaceSetup(
  notionApi: ReturnType<typeof createNotionApi>,
  input: { existingRootPageId: string | null; existingDatabaseId: string | null }
): Promise<NotionDatabaseInfo> {
  if (input.existingRootPageId && input.existingDatabaseId) {
    return {
      rootPageId: input.existingRootPageId,
      rootPageUrl: null,
      databaseId: input.existingDatabaseId,
      databaseUrl: null
    };
  }

  const rootPage = await notionApi.post<{ id: string; url?: string }>("/pages", {
    parent: { workspace: true },
    properties: {
      title: { title: [{ text: { content: ROOT_PAGE_TITLE } }] }
    }
  });

  const database = await notionApi.post<{ id: string; url?: string }>("/databases", {
    parent: { page_id: rootPage.id },
    title: [{ type: "text", text: { content: DATABASE_TITLE } }],
    properties: {
      [PROPERTY_TITLE]: { title: {} },
      [PROPERTY_DATE]: { date: {} },
      [PROPERTY_CATEGORY]: { select: {} },
      [PROPERTY_DESCRIPTION]: { rich_text: {} },
      [PROPERTY_PULSE_ID]: { rich_text: {} },
      [PROPERTY_ALL_DAY]: { checkbox: {} }
    }
  });

  return {
    rootPageId: rootPage.id,
    rootPageUrl: typeof rootPage.url === "string" ? rootPage.url : null,
    databaseId: database.id,
    databaseUrl: typeof database.url === "string" ? database.url : null
  };
}

async function persistWorkspaceIdsIfNeeded(configPool: Pool, id: string, info: NotionDatabaseInfo): Promise<void> {
  await configPool.query(
    `UPDATE notion_connections
        SET root_page_id = COALESCE(root_page_id, $2),
            root_page_url = COALESCE(root_page_url, $3),
            database_id = COALESCE(database_id, $4),
            database_url = COALESCE(database_url, $5),
            updated_at = NOW()
      WHERE id = $1`,
    [id, info.rootPageId, info.rootPageUrl, info.databaseId, info.databaseUrl]
  );
}

async function listNotionRemoteEvents(notionApi: ReturnType<typeof createNotionApi>, databaseId: string, timezone: string): Promise<NotionRemoteEvent[]> {
  const results: NotionRemoteEvent[] = [];
  let hasMore = true;
  let startCursor: string | null = null;

  while (hasMore) {
    const queryBody: { page_size: number; start_cursor?: string } = startCursor ? { page_size: 100, start_cursor: startCursor } : { page_size: 100 };
    const query: { results?: NotionApiPage[]; has_more?: boolean; next_cursor?: string | null } = await notionApi.post(`/databases/${databaseId}/query`, queryBody);

    for (const page of query.results ?? []) {
      const mapped = mapNotionPageToRemoteEvent(page, timezone);
      if (mapped) results.push(mapped);
    }

    hasMore = query.has_more === true;
    startCursor = typeof query.next_cursor === "string" ? query.next_cursor : null;
  }

  return results;
}

function mapNotionPageToRemoteEvent(page: NotionApiPage, timezone: string): NotionRemoteEvent | null {
  const properties = page.properties ?? {};
  const title = getTitleProperty(properties[PROPERTY_TITLE])?.trim() ?? "";
  if (!title) return null;
  const dateProp = getDateProperty(properties[PROPERTY_DATE]);
  if (!dateProp?.start) return null;

  const category = getSelectPropertyName(properties[PROPERTY_CATEGORY]) ?? undefined;
  const description = getRichTextPlainText(properties[PROPERTY_DESCRIPTION]) || undefined;
  const pulseEventId = getRichTextPlainText(properties[PROPERTY_PULSE_ID]) || null;
  const allDayCheckbox = getCheckboxProperty(properties[PROPERTY_ALL_DAY]);
  const startParts = parseNotionDateValue(dateProp.start);
  const endParts = dateProp.end ? parseNotionDateValue(dateProp.end) : null;
  const allDay = allDayCheckbox || startParts.allDay;

  return {
    remoteId: page.id,
    remoteEtag: page.last_edited_time ?? null,
    title,
    description,
    category,
    date: startParts.date,
    endDate: allDay ? endParts?.date ?? undefined : undefined,
    startTime: allDay ? undefined : startParts.time,
    endTime: allDay ? undefined : endParts?.time ?? undefined,
    allDay,
    updatedAt: page.last_edited_time ?? null,
    pulseEventId,
    timezone
  };
}

function buildNotionPagePayload(localEvent: LocalCalendarEvent, databaseId: string): Record<string, unknown> {
  return {
    parent: { database_id: databaseId },
    properties: {
      [PROPERTY_TITLE]: { title: [{ text: { content: truncateText(localEvent.title, 1900) } }] },
      [PROPERTY_DATE]: { date: buildNotionDateProperty(localEvent) },
      [PROPERTY_CATEGORY]: { select: { name: localEvent.category ?? "Outros" } },
      [PROPERTY_DESCRIPTION]: {
        rich_text: localEvent.description ? [{ text: { content: truncateText(localEvent.description, 1900) } }] : []
      },
      [PROPERTY_PULSE_ID]: { rich_text: [{ text: { content: localEvent.pageId } }] },
      [PROPERTY_ALL_DAY]: { checkbox: Boolean(localEvent.allDay) }
    }
  };
}

function buildNotionDateProperty(localEvent: LocalCalendarEvent): { start: string; end?: string } {
  if (localEvent.allDay) {
    return { start: localEvent.date, end: localEvent.endDate ?? undefined };
  }
  return {
    start: `${localEvent.date}T${localEvent.startTime ?? "00:00"}:00`,
    end: localEvent.endTime ? `${localEvent.date}T${localEvent.endTime}:00` : undefined
  };
}

async function notifyProvidersAfterRemoteSync(deps: NotionSyncDependencies, eventId: string, deleted: boolean): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (deleted) {
    if (deps.notifyAppleEventDelete) {
      tasks.push(
        deps.notifyAppleEventDelete(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[notion-connector] Não consegui propagar delete para Apple (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
    if (deps.notifyGoogleEventDelete) {
      tasks.push(
        deps.notifyGoogleEventDelete(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[notion-connector] Não consegui propagar delete para Google (${eventId}): ${
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
            `[notion-connector] Não consegui propagar update para Apple (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
    if (deps.notifyGoogleEventSync) {
      tasks.push(
        deps.notifyGoogleEventSync(eventId).catch((error) => {
          deps.logger?.warn?.(
            `[notion-connector] Não consegui propagar update para Google (${eventId}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        })
      );
    }
  }
  await Promise.all(tasks);
}
async function getRawNotionConnectionRow(
  configPool: Pool,
  userId?: string
): Promise<NotionConnectionRow | null> {
  const result = await configPool.query<NotionConnectionRow>(
    `SELECT * FROM notion_connections WHERE ($1::text IS NULL OR user_id = $1) ORDER BY updated_at DESC LIMIT 1`,
    [userId ?? null]
  );
  return result.rows[0] ?? null;
}

async function ensureNotionConnectionRow(configPool: Pool, userId: string): Promise<{ id: string }> {
  const existing = await getRawNotionConnectionRow(configPool, userId);
  if (existing) return { id: existing.id };
  const id = randomUUID();
  await configPool.query(`INSERT INTO notion_connections (id, user_id, enabled, sync_mode) VALUES ($1, $2, FALSE, 'bidirectional')`, [id, userId]);
  return { id };
}

async function getEnabledNotionConnection(
  deps: Pick<NotionSyncDependencies, "configPool" | "configEncryptionKey">,
  requireEnabled = true,
  userId?: string
): Promise<NotionConnection | null> {
  const row = await getRawNotionConnectionRow(deps.configPool, userId);
  if (!row) return null;
  if (requireEnabled && !row.enabled) return null;
  return {
    id: row.id,
    userId: row.user_id ?? "",
    enabled: row.enabled,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceIcon: row.workspace_icon,
    accessToken: row.access_token_encrypted && deps.configEncryptionKey ? decryptSecret(row.access_token_encrypted, deps.configEncryptionKey) : null,
    botId: row.bot_id,
    rootPageId: row.root_page_id,
    rootPageUrl: row.root_page_url,
    databaseId: row.database_id,
    databaseUrl: row.database_url,
    syncMode: row.sync_mode || "bidirectional",
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    lastError: row.last_error
  };
}

async function getEnabledNotionConnectionForDiscordUser(
  deps: Pick<NotionSyncDependencies, "configPool" | "configEncryptionKey">,
  discordUserId: string
): Promise<NotionConnection | null> {
  const result = await deps.configPool.query<NotionConnectionRow>(
    `
      SELECT nc.*
      FROM notion_connections nc
      JOIN dashboard_runtime_settings drs
        ON drs.user_id = nc.user_id
      WHERE nc.enabled = TRUE
        AND nc.access_token_encrypted IS NOT NULL
        AND (
          drs.linked_discord_user_id = $1
          OR drs.linked_user_id = $1
          OR nc.user_id = $1
        )
      ORDER BY nc.updated_at DESC
      LIMIT 1
    `,
    [discordUserId]
  );

  const row = result.rows[0];
  if (!row || !row.user_id) {
    return null;
  }

  return getEnabledNotionConnection(deps, true, row.user_id);
}

async function listEnabledNotionConnectionUserIds(configPool: Pool): Promise<string[]> {
  const result = await configPool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM notion_connections
      WHERE enabled = TRUE
        AND user_id IS NOT NULL
      ORDER BY updated_at DESC
    `
  );

  return [...new Set(result.rows.map((row) => row.user_id).filter(Boolean))];
}

async function listNotionConnectionUserIdsForWebhook(
  configPool: Pool,
  workspaceId: string | null,
  integrationId: string | null
): Promise<string[]> {
  const result = await configPool.query<{ user_id: string }>(
    `
      SELECT user_id
      FROM notion_connections
      WHERE enabled = TRUE
        AND user_id IS NOT NULL
        AND (
          ($1::text IS NOT NULL AND workspace_id = $1)
          OR ($2::text IS NOT NULL AND bot_id = $2)
        )
      ORDER BY updated_at DESC
    `,
    [workspaceId, integrationId]
  );

  return [...new Set(result.rows.map((row) => row.user_id).filter(Boolean))];
}

async function getNotionLinkByEventId(eventPool: Pool, eventId: string): Promise<NotionProviderLink | null> {
  const result = await eventPool.query(`SELECT * FROM calendar_provider_links WHERE provider = $1 AND event_id = $2 LIMIT 1`, [NOTION_PROVIDER, eventId]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapNotionProviderLink(row) : null;
}

async function getAllNotionLinks(eventPool: Pool): Promise<NotionProviderLink[]> {
  const result = await eventPool.query(`SELECT * FROM calendar_provider_links WHERE provider = $1`, [NOTION_PROVIDER]);
  return result.rows.map((row) => mapNotionProviderLink(row as Record<string, unknown>));
}

async function hasNewerNonNotionProviderSync(
  eventPool: Pool,
  eventId: string,
  notionLastSyncedAt: string
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
    [eventId, NOTION_PROVIDER, notionLastSyncedAt]
  );

  return result.rows[0]?.newer_exists === true;
}

async function upsertNotionProviderLink(
  eventPool: Pool,
  input: { eventId: string; remoteId: string; remoteEtag: string | null }
): Promise<void> {
  await eventPool.query(
    `INSERT INTO calendar_provider_links (id, event_id, provider, remote_id, remote_etag, last_synced_at, last_error)
     VALUES ($1, $2, $3, $4, $5, NOW(), NULL)
     ON CONFLICT (provider, event_id)
     DO UPDATE SET remote_id = EXCLUDED.remote_id,
                   remote_etag = EXCLUDED.remote_etag,
                   last_synced_at = NOW(),
                   last_error = NULL,
                   updated_at = NOW()`,
    [randomUUID(), input.eventId, NOTION_PROVIDER, input.remoteId, input.remoteEtag]
  );
}

async function setNotionLinkErrorByEventId(eventPool: Pool, eventId: string, lastError: string): Promise<void> {
  await eventPool.query(`UPDATE calendar_provider_links SET last_error = $3, updated_at = NOW() WHERE provider = $1 AND event_id = $2`, [NOTION_PROVIDER, eventId, lastError]);
}

async function deleteNotionProviderLinkByEventId(eventPool: Pool, eventId: string): Promise<void> {
  await eventPool.query(`DELETE FROM calendar_provider_links WHERE provider = $1 AND event_id = $2`, [NOTION_PROVIDER, eventId]);
}

async function getStoredEventById(eventPool: Pool, id: string, includeDeleted: boolean): Promise<LocalCalendarEvent | null> {
  const result = await eventPool.query(`SELECT * FROM calendar_events WHERE id = $1 AND ($2::boolean = TRUE OR deleted_at IS NULL) LIMIT 1`, [id, includeDeleted]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  return row ? mapStoredEvent(row) : null;
}

async function getAllStoredEventsByIds(eventPool: Pool, ids: string[]): Promise<LocalCalendarEvent[]> {
  if (ids.length === 0) return [];
  const result = await eventPool.query(`SELECT * FROM calendar_events WHERE id = ANY($1::text[])`, [ids]);
  return result.rows.map((row) => mapStoredEvent(row as Record<string, unknown>));
}

async function getActiveStoredEventsWithoutNotionLink(eventPool: Pool): Promise<LocalCalendarEvent[]> {
  const result = await eventPool.query(`
    SELECT e.*
      FROM calendar_events e
      LEFT JOIN calendar_provider_links l ON l.event_id = e.id AND l.provider = $1
     WHERE e.deleted_at IS NULL AND l.id IS NULL
     ORDER BY e.event_date ASC, COALESCE(e.start_time, '00:00') ASC, e.created_at ASC`, [NOTION_PROVIDER]);
  return result.rows.map((row) => mapStoredEvent(row as Record<string, unknown>));
}

async function softDeleteStoredEvent(eventPool: Pool, eventId: string): Promise<void> {
  await eventPool.query(`UPDATE calendar_events SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [eventId]);
}

async function insertStoredEventFromRemote(
  deps: NotionSyncDependencies,
  remoteEvent: NotionRemoteEvent,
  runtimeLink: DashboardRuntimeLink | null
): Promise<string> {
  const eventId = remoteEvent.pulseEventId ?? randomUUID();
  await deps.eventPool.query(
    `INSERT INTO calendar_events (
      id, title, event_date, end_date, start_time, end_time, all_day, description, category,
      raw_date, source_name, source_channel_id, source_user_id, source_username, source_message_id, timezone
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, $12, $13, NULL, $14
    ) ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      remoteEvent.title,
      remoteEvent.date,
      remoteEvent.endDate ?? null,
      remoteEvent.startTime ?? null,
      remoteEvent.endTime ?? null,
      remoteEvent.allDay,
      remoteEvent.description ?? null,
      deps.resolveCategoryLabel(remoteEvent.title, remoteEvent.description, remoteEvent.category),
      "notion",
      runtimeLink?.conversationChannelId ?? null,
      runtimeLink?.primarySourceUserId ?? null,
      runtimeLink?.linkedDiscordUsername ?? null,
      remoteEvent.timezone
    ]
  );
  return eventId;
}
async function applyRemoteEventToLocal(
  deps: NotionSyncDependencies,
  remoteEvent: NotionRemoteEvent,
  localEventId: string,
  runtimeLink: DashboardRuntimeLink | null,
  existingLocalEvent: LocalCalendarEvent | null
): Promise<void> {
  const sourceName = existingLocalEvent?.sourceName ?? "notion";
  const sourceChannelId = existingLocalEvent?.sourceChannelId ?? runtimeLink?.conversationChannelId ?? null;
  const sourceUserId = existingLocalEvent?.sourceUserId ?? runtimeLink?.primarySourceUserId ?? null;
  const sourceUsername = existingLocalEvent?.sourceUsername ?? runtimeLink?.linkedDiscordUsername ?? null;

  await deps.eventPool.query(
    `UPDATE calendar_events
        SET title = $2,
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
      WHERE id = $1`,
    [
      localEventId,
      remoteEvent.title,
      remoteEvent.date,
      remoteEvent.endDate ?? null,
      remoteEvent.startTime ?? null,
      remoteEvent.endTime ?? null,
      remoteEvent.allDay,
      remoteEvent.description ?? null,
      deps.resolveCategoryLabel(remoteEvent.title, remoteEvent.description, remoteEvent.category ?? existingLocalEvent?.category),
      sourceName,
      sourceChannelId,
      sourceUserId,
      sourceUsername,
      remoteEvent.timezone
    ]
  );
}

async function updateNotionConnectionSyncStatus(
  configPool: Pool,
  userId: string,
  lastError: string | null,
  success: boolean
): Promise<void> {
  await configPool.query(
    `UPDATE notion_connections
        SET last_sync_at = CASE WHEN $1 THEN NOW() ELSE last_sync_at END,
            last_error = $2,
            updated_at = NOW()
      WHERE user_id = $3`,
    [success, lastError, userId]
  );
}

async function getDashboardRuntimeLink(
  configPool: Pool,
  userId: string
): Promise<DashboardRuntimeLink | null> {
  try {
    const result = await configPool.query(`
      SELECT linked_discord_user_id, linked_user_id, linked_discord_username, conversation_channel_id
        FROM dashboard_runtime_settings
       WHERE enabled = TRUE
         AND user_id = $1
         AND conversation_channel_id IS NOT NULL
       ORDER BY updated_at DESC`, [userId]);
    const rows = result.rows as Record<string, unknown>[];
    if (rows.length === 0) return null;

    const asString = (value: unknown): string | null =>
      typeof value === "string" && value.length > 0 ? value : null;

    // O id da conta do utilizador (UUID) tambem conta como dono dos eventos,
    // porque alguns gateways (ex.: Telegram) gravam source_user_id = UUID.
    const ownedSourceUserIds = new Set<string>([userId]);
    for (const row of rows) {
      const discordId = asString(row.linked_discord_user_id);
      const linkedId = asString(row.linked_user_id);
      if (discordId) ownedSourceUserIds.add(discordId);
      if (linkedId) ownedSourceUserIds.add(linkedId);
    }

    const firstRow = rows[0];
    // Carimbamos eventos importados do remoto sempre com o UUID da conta, para
    // manter uma identidade unica de source_user_id em todo o sistema.
    const primarySourceUserId = userId;

    return {
      linkedDiscordUserId: asString(firstRow.linked_discord_user_id),
      linkedDiscordUsername: asString(firstRow.linked_discord_username),
      conversationChannelId: asString(firstRow.conversation_channel_id),
      primarySourceUserId,
      ownedSourceUserIds: [...ownedSourceUserIds]
    };
  } catch {
    return null;
  }
}

function filterEventsForRuntimeUser(
  events: LocalCalendarEvent[],
  runtimeLink: DashboardRuntimeLink | null
): LocalCalendarEvent[] {
  const ownedIds = runtimeLink?.ownedSourceUserIds ?? [];
  if (ownedIds.length === 0) {
    return [];
  }

  const owned = new Set(ownedIds);
  return events.filter((event) => event.sourceUserId != null && owned.has(event.sourceUserId));
}

function filterSingleEventForRuntimeUser(
  event: LocalCalendarEvent | null,
  runtimeLink: DashboardRuntimeLink | null
): LocalCalendarEvent | null {
  if (!event) {
    return null;
  }

  const ownedIds = runtimeLink?.ownedSourceUserIds ?? [];
  if (ownedIds.length === 0) {
    return null;
  }

  return event.sourceUserId != null && ownedIds.includes(event.sourceUserId) ? event : null;
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

function mapNotionProviderLink(row: Record<string, unknown>): NotionProviderLink {
  return {
    id: String(row.id),
    eventId: String(row.event_id),
    remoteId: String(row.remote_id),
    remoteEtag: typeof row.remote_etag === "string" ? row.remote_etag : null,
    lastSyncedAt: asIsoString(row.last_synced_at)
  };
}

function shouldTreatMissingRemoteAsDeletion(localEvent: LocalCalendarEvent, link: NotionProviderLink): boolean {
  if (!link.lastSyncedAt || !localEvent.updatedAt) return false;
  return toEpoch(localEvent.updatedAt) <= toEpoch(link.lastSyncedAt);
}
function hasLocalChangedSinceLastSync(localEvent: LocalCalendarEvent, link: NotionProviderLink): boolean {
  if (!localEvent.updatedAt) return false;
  if (!link.lastSyncedAt) return true;
  return toEpoch(localEvent.updatedAt) > toEpoch(link.lastSyncedAt);
}
function hasRemoteChangedSinceLastSync(remoteEvent: NotionRemoteEvent, link: NotionProviderLink): boolean {
  if (remoteEvent.updatedAt && link.lastSyncedAt) return toEpoch(remoteEvent.updatedAt) > toEpoch(link.lastSyncedAt);
  if (!remoteEvent.remoteEtag) return false;
  return remoteEvent.remoteEtag !== link.remoteEtag;
}
function eventsAreEquivalent(localEvent: LocalCalendarEvent, remoteEvent: NotionRemoteEvent): boolean {
  return (
    normalizeLooseText(localEvent.title) === normalizeLooseText(remoteEvent.title) &&
    normalizeLooseText(localEvent.description ?? "") === normalizeLooseText(remoteEvent.description ?? "") &&
    localEvent.date === remoteEvent.date &&
    (localEvent.endDate ?? "") === (remoteEvent.endDate ?? "") &&
    (localEvent.startTime ?? "") === (remoteEvent.startTime ?? "") &&
    (localEvent.endTime ?? "") === (remoteEvent.endTime ?? "") &&
    Boolean(localEvent.allDay) === Boolean(remoteEvent.allDay)
  );
}
function getTitleProperty(value: unknown): string | null {
  const titleItems = (value as { title?: Array<{ plain_text?: string }> } | undefined)?.title;
  if (!Array.isArray(titleItems)) return null;
  return titleItems.map((item) => item?.plain_text ?? "").join("").trim() || null;
}
function getDateProperty(value: unknown): { start: string; end?: string | null } | null {
  const date = (value as { date?: { start?: string; end?: string | null } } | undefined)?.date;
  if (!date?.start) return null;
  return { start: date.start, end: date.end ?? null };
}
function getSelectPropertyName(value: unknown): string | null {
  return (value as { select?: { name?: string } } | undefined)?.select?.name?.trim() ?? null;
}
function getCheckboxProperty(value: unknown): boolean {
  return (value as { checkbox?: boolean } | undefined)?.checkbox === true;
}
function getRichTextPlainText(value: unknown): string | null {
  const richText = (value as { rich_text?: Array<{ plain_text?: string }> } | undefined)?.rich_text;
  if (!Array.isArray(richText)) return null;
  return richText.map((item) => item?.plain_text ?? "").join("").trim() || null;
}
function parseNotionDateValue(value: string): { date: string; time?: string; allDay: boolean } {
  if (!value.includes("T")) return { date: value.slice(0, 10), allDay: true };
  const timeMatch = value.match(/T(\d{2}:\d{2})/);
  return { date: value.slice(0, 10), time: timeMatch?.[1], allDay: false };
}
function truncateText(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit);
}
function formatDateValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value);
}
function formatNullableDateValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return formatDateValue(value);
}
function formatNullableTimeValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 16);
  const raw = String(value);
  const match = raw.match(/^(\d{2}:\d{2})/);
  return match?.[1] ?? raw;
}
function asIsoString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
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
  return [iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptSecret(ciphertext: string, secret: string): string {
  const [ivPart, tagPart, contentPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !contentPart) throw new Error("O segredo Notion guardado está inválido.");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(contentPart, "base64url")), decipher.final()]).toString("utf-8");
}
function safeJsonParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
function normalizeLooseText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim();
}




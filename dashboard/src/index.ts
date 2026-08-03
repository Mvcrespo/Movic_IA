import "dotenv/config";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Pool } from "pg";
import {
  authenticateUser,
  countActiveAdmins,
  clearSessionCookie,
  createSession,
  createUser,
  deleteUserIdentity,
  destroySession,
  ensureAuthSchema,
  generateTemporaryPassword,
  getCurrentUser,
  getUserById,
  listUsers,
  setUserActiveState,
  setSessionCookie,
  updatePassword,
  type AppUser
} from "./auth.js";
import {
  handleFrontendAssetRequest as serveFrontendAssetRequest,
  handlePublicAssetRequest as servePublicAssetRequest,
  renderFrontendPage
} from "./frontend-shell.js";
import { isValidNotionWebhookSignature } from "./notion-webhook-security.js";

type RuntimeSettings = {
  id: string;
  userId: string;
  conversationPlatform: "discord" | "telegram";
  conversationChannelId: string | null;
  enabled: boolean;
  isPrimary: boolean;
  updatedAt: string;
  linkedUserId: string | null;
  linkedUsername: string | null;
  linkedDiscordUserId: string | null;
  linkedDiscordUsername: string | null;
  linkedAt: string | null;
  linkCode: string | null;
  linkCodeExpiresAt: string | null;
};

type RuntimeSettingsRow = {
  id: string;
  user_id: string;
  conversation_platform: "discord" | "telegram";
  conversation_channel_id: string | null;
  enabled: boolean;
  is_primary: boolean;
  updated_at: string;
  linked_user_id: string | null;
  linked_username: string | null;
  linked_discord_user_id: string | null;
  linked_discord_username: string | null;
  linked_at: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
};

type RuntimeChatLinks = {
  discord: RuntimeSettings | null;
  telegram: RuntimeSettings | null;
};

type AppleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
};

type GoogleCalendarOption = {
  id: string;
  name: string;
  description: string | null;
  timezone: string | null;
  primary: boolean;
};

type AppleCalendarConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string | null;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  discoveredCalendars: AppleCalendarOption[];
  syncMode: string;
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  hasStoredSecret: boolean;
  storedSecretEncrypted?: string | null;
};

type GoogleCalendarConnection = {
  id: string;
  userId: string;
  enabled: boolean;
  accountEmail: string | null;
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  discoveredCalendars: GoogleCalendarOption[];
  syncMode: string;
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
};

type NotionConnection = {
  id: string;
  userId: string;
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

type DiscordBotIdentity = {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
};

type SleepNotificationPreferences = {
  userId: string;
  enabled: boolean;
  sleepStartTime: string | null;
  sleepEndTime: string | null;
  wakeStartTime: string | null;
  wakeEndTime: string | null;
  onboardingStep: "sleep" | "wake" | null;
  lastEveningSentOn: string | null;
  lastMorningSentOn: string | null;
  updatedAt: string;
};

type SleepNotificationPreferencesRow = {
  user_id: string;
  enabled: boolean;
  sleep_start_time: string | null;
  sleep_end_time: string | null;
  wake_start_time: string | null;
  wake_end_time: string | null;
  onboarding_step: "sleep" | "wake" | null;
  last_evening_sent_on: string | null;
  last_morning_sent_on: string | null;
  updated_at: string;
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

const env = {
  port: Number(process.env.DASHBOARD_PORT ?? "8088"),
  baseUrl: (process.env.DASHBOARD_BASE_URL ?? "http://localhost:8088").replace(/\/$/, ""),
  contactEmail: process.env.PUBLIC_CONTACT_EMAIL ?? "",
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? "http://orchestrator:8000",
  calendarServiceUrl: process.env.CALENDAR_SERVICE_URL ?? "http://calendar-service:8003",
  discordGatewayUrl: process.env.DISCORD_GATEWAY_URL ?? "http://gateway:8010",
  telegramGatewayUrl: process.env.TELEGRAM_GATEWAY_URL ?? "http://telegram-gateway:8011",
  appleConnectorUrl: process.env.APPLE_CONNECTOR_URL ?? "http://apple-connector:8006",
  googleConnectorUrl: process.env.GOOGLE_CONNECTOR_URL ?? "http://google-connector:8007",
  notionConnectorUrl: process.env.NOTION_CONNECTOR_URL ?? "http://notion-connector:8008",
  postgresUrl: process.env.CONFIG_POSTGRES_URL ?? "",
  internalApiToken: process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "",
  notionWebhookVerificationToken: process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN ?? "",
  discordToken: process.env.DISCORD_TOKEN ?? "",
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  configEncryptionKey: process.env.CONFIG_ENCRYPTION_KEY ?? "",
  defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL ?? "",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD ?? ""
};

const NOTIFICATION_SCHEDULER_INTERVAL_MS = 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_NOTION_WEBHOOK_BODY_BYTES = 256 * 1024;

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

validateEnv();

const pool = new Pool({
  connectionString: env.postgresUrl
});

let botIdentityCache: {
  value: DiscordBotIdentity | null;
  loadedAt: number;
} = {
  value: null,
  loadedAt: 0
};

await ensureAuthSchema(pool, {
  seedAdminEmail: env.defaultAdminEmail,
  seedAdminPassword: env.defaultAdminPassword
});
await ensureSchema();

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", env.baseUrl);
    const path = requestUrl.pathname;
    const currentUser = await getCurrentUser(pool, request);

    if (method === "GET" && path === "/health") {
      return writeJson(response, 200, {
        status: "ok",
        service: "dashboard-service"
      });
    }

    if (method === "GET" && path.startsWith("/app/")) {
      return serveFrontendAssetRequest(response, path);
    }

    if (method === "GET" && path.startsWith("/assets/")) {
      return servePublicAssetRequest(response, path);
    }

    if (method === "GET" && path === "/api/runtime-config/resolve") {
      return handleRuntimeConfigResolveRequest(request, response, requestUrl);
    }

    if (method === "GET" && path === "/api/runtime-config") {
      return handleRuntimeConfigRequest(request, response);
    }

    if (method === "POST" && path === "/api/link-code/claim") {
      return handleLinkCodeClaimRequest(request, response);
    }

    if (method === "POST" && path === "/api/notification-preferences/chat-message") {
      return handleNotificationPreferenceChatMessageRequest(request, response);
    }

    if (method === "GET" && path === "/") {
      if (currentUser) {
        return redirect(response, currentUser.mustChangePassword ? "/change-password" : "/dashboard");
      }

      return redirect(response, "/home");
    }

    if (method === "GET" && path === "/home") {
      return writeHtml(
        response,
        200,
        renderFrontendPage({
          title: "Movic | Home",
          page: "home",
          payload: {
            contactEmail: getMarketingContactEmail(),
            isAuthenticated: Boolean(currentUser)
          }
        })
      );
    }

    if (method === "GET" && path === "/get-started") {
      if (currentUser) {
        return redirect(response, currentUser.mustChangePassword ? "/change-password" : "/dashboard");
      }

      return writeHtml(
        response,
        200,
        renderFrontendPage({
          title: "Movic | Get Started",
          page: "get-started",
          payload: {
            contactEmail: getMarketingContactEmail()
          }
        })
      );
    }

    if (method === "GET" && path === "/privacy-policy") {
      return writeHtml(
        response,
        200,
        renderFrontendPage({
          title: "Movic | Privacy Policy",
          page: "privacy-policy",
          payload: {
            contactEmail: getMarketingContactEmail(),
            isAuthenticated: Boolean(currentUser)
          }
        })
      );
    }

    if (method === "GET" && path === "/terms-of-service") {
      return writeHtml(
        response,
        200,
        renderFrontendPage({
          title: "Movic | Terms of Service",
          page: "terms-of-service",
          payload: {
            contactEmail: getMarketingContactEmail(),
            isAuthenticated: Boolean(currentUser)
          }
        })
      );
    }

    if (method === "GET" && path === "/login") {
      if (currentUser) {
        return redirect(response, currentUser.mustChangePassword ? "/change-password" : "/dashboard");
      }

      const errorCode =
        requestUrl.searchParams.get("error") === "inactive"
          ? "inactive"
          : requestUrl.searchParams.get("error") === "invalid" || requestUrl.searchParams.get("error") === "1"
            ? "invalid_credentials"
            : null;
      return writeHtml(response, 200, renderLoginVuePage(errorCode));
    }

    if (method === "POST" && path === "/login") {
      const body = parseFormBody(await readBody(request));
      const email = sanitizeText(body.email ?? null) ?? "";
      const password = body.password ?? "";
      const result = await authenticateUser(pool, email, password);

      if (result.status === "inactive") {
        return redirect(response, "/login?error=inactive");
      }

      if (result.status !== "success") {
        return redirect(response, "/login?error=invalid");
      }

      const token = await createSession(pool, result.user.id);
      setSessionCookie(response, token);
      return redirect(response, result.user.mustChangePassword ? "/change-password" : "/dashboard");
    }

    if (method === "POST" && path === "/logout") {
      await destroySession(pool, request);
      clearSessionCookie(response);
      return redirect(response, "/");
    }

    if (method === "GET" && path === "/change-password") {
      if (!currentUser) {
        return redirect(response, "/login");
      }

      const errorMessage =
        requestUrl.searchParams.get("error") === "1"
          ? "Não consegui atualizar a password. Confirma a password atual e tenta outra vez."
          : null;
      return writeHtml(response, 200, renderChangePasswordVuePage(currentUser, errorMessage));
    }

    if (method === "POST" && path === "/change-password") {
      if (!currentUser) {
        return redirect(response, "/login");
      }

      const body = parseFormBody(await readBody(request));
      const currentPassword = body.currentPassword ?? "";
      const nextPassword = body.nextPassword ?? "";
      const confirmPassword = body.confirmPassword ?? "";

      if (!nextPassword || nextPassword !== confirmPassword) {
        return redirect(response, "/change-password?error=1");
      }

      try {
        await updatePassword(pool, currentUser.id, currentPassword, nextPassword);
        return redirect(response, "/dashboard?passwordChanged=1");
      } catch {
        return redirect(response, "/change-password?error=1");
      }
    }

    if (path.startsWith("/dashboard")) {
      if (!currentUser) {
        return redirect(response, "/login");
      }

      if (currentUser.mustChangePassword && path !== "/change-password") {
        return redirect(response, "/change-password");
      }
    }

    if (method === "GET" && path === "/dashboard") {
      const requestedChatPlatform = parseConversationPlatform(requestUrl.searchParams.get("tab"));
      const chatLinks = await getRuntimeChatLinks(currentUser!.id);
      const settings = await getRuntimeSettings(currentUser!.id);
      const activePlatformSettings = chatLinks[requestedChatPlatform];
      const activeLinkCode = await ensureActiveLinkCode(
        currentUser!.id,
        requestedChatPlatform,
        activePlatformSettings
      );
      const appleConnection = await getAppleCalendarConnection(currentUser!.id);
      const googleConnection = await getGoogleCalendarConnection(currentUser!.id);
      const notionConnection = await getNotionConnection(currentUser!.id);
      const notificationPreferences = await ensureSleepNotificationPreferences(currentUser!.id);
      const botIdentity = await getDiscordBotIdentity();
      const users = currentUser!.role === "admin" ? await listUsers(pool) : [];
      return writeHtml(
        response,
        200,
        renderDashboardVuePage(
          currentUser!,
          users,
          settings,
          chatLinks,
          activeLinkCode,
          appleConnection,
          googleConnection,
          notionConnection,
          notificationPreferences,
          botIdentity,
          requestUrl.searchParams
        )
      );
    }

    if (method === "POST" && path === "/dashboard/generate-code") {
      const body = parseFormBody(await readBody(request));
      const platform = parseConversationPlatform(body.platform);
      await rotateLinkCode(currentUser!.id, platform);
      return redirect(response, `/dashboard?tab=${platform}&generated=1`);
    }

    if (method === "POST" && path === "/dashboard/unlink") {
      const body = parseFormBody(await readBody(request));
      const platform = parseConversationPlatform(body.platform);
      await unlinkChat(currentUser!.id, platform);
      return redirect(response, `/dashboard?tab=${platform}&unlinked=1`);
    }

    if (method === "POST" && path === "/dashboard/chat-primary") {
      const body = parseFormBody(await readBody(request));
      const platform = parseConversationPlatform(body.platform);
      await setPrimaryChat(currentUser!.id, platform);
      return redirect(response, `/dashboard?tab=${platform}&primaryChanged=1`);
    }

    if (method === "POST" && path === "/dashboard/notification-preferences") {
      const body = parseFormBody(await readBody(request));
      await saveSleepNotificationPreferencesFromDashboard(currentUser!.id, {
        enabled: body.notificationsEnabled === "on",
        sleepStartTime: normalizeClockInput(body.sleepStartTime ?? ""),
        sleepEndTime: normalizeClockInput(body.sleepEndTime ?? ""),
        wakeStartTime: normalizeClockInput(body.wakeStartTime ?? ""),
        wakeEndTime: normalizeClockInput(body.wakeEndTime ?? "")
      });
      return redirect(response, "/dashboard?tab=discord&notificationPrefsSaved=1");
    }

    if (method === "POST" && path === "/dashboard/apple/test") {
      if (!env.configEncryptionKey) {
        await updateAppleConnectionError(
          currentUser!.id,
          "Falta CONFIG_ENCRYPTION_KEY para guardar a configuração Apple com segurança."
        );
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }

      const body = parseFormBody(await readBody(request));
      const existing = await getAppleCalendarConnection(currentUser!.id);
      const accountEmail = sanitizeText(body.accountEmail ?? existing?.accountEmail ?? null);
      const password = resolveApplePasswordInput(body.appSpecificPassword ?? "", existing, accountEmail);

      if (!accountEmail || !password) {
        await updateAppleConnectionError(
          currentUser!.id,
          "Tens de indicar o email Apple e a app-specific password."
        );
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }

      try {
        const result = await requestAppleCalendarTest({
          accountEmail,
          appSpecificPassword: password
        });

        await saveAppleConnectionDraft({
          userId: currentUser!.id,
          accountEmail,
          appSpecificPassword: password,
          calendars: result.calendars,
          defaultCalendarId: result.defaultCalendar.id,
          defaultCalendarName: result.defaultCalendar.name,
          enabled: existing?.enabled ?? false,
          syncMode: existing?.syncMode ?? "bidirectional"
        });

        return redirect(response, "/dashboard?tab=apple&appleTested=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateAppleConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/apple/save") {
      if (!env.configEncryptionKey) {
        await updateAppleConnectionError(
          currentUser!.id,
          "Falta CONFIG_ENCRYPTION_KEY para guardar a configuração Apple com segurança."
        );
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }

      const body = parseFormBody(await readBody(request));
      const existing = await getAppleCalendarConnection(currentUser!.id);
      const accountEmail = sanitizeText(body.accountEmail ?? existing?.accountEmail ?? null);
      const password = resolveApplePasswordInput(body.appSpecificPassword ?? "", existing, accountEmail);
      const syncMode = sanitizeText(body.syncMode ?? existing?.syncMode ?? "bidirectional") ?? "bidirectional";

      if (!accountEmail) {
        await updateAppleConnectionError(currentUser!.id, "Tens de indicar o email Apple.");
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }

      if (!password) {
        await updateAppleConnectionError(
          currentUser!.id,
          "Falta a app-specific password da conta Apple."
        );
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }

      const result = await requestAppleCalendarTest({
        accountEmail,
        appSpecificPassword: password
      });

      await saveAppleConnectionDraft({
        userId: currentUser!.id,
        accountEmail,
        appSpecificPassword: password,
        calendars: result.calendars,
        defaultCalendarId: result.defaultCalendar.id,
        defaultCalendarName: result.defaultCalendar.name,
        enabled: true,
        syncMode
      });

      return redirect(response, "/dashboard?tab=apple&appleSaved=1");
    }

    if (method === "POST" && path === "/dashboard/apple/disable") {
      await disableAppleConnection(currentUser!.id);
      return redirect(response, "/dashboard?tab=apple&appleDisabled=1");
    }

    if (method === "POST" && path === "/dashboard/apple/sync-now") {
      try {
        await requestAppleSyncNow(currentUser!.id);
        return redirect(response, "/dashboard?tab=apple&appleSynced=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateAppleConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=apple&appleError=1");
      }
    }

    if (method === "GET" && path === "/dashboard/google/connect") {
      try {
        const authUrl = await requestGoogleAuthUrl(currentUser!.id);
        return redirect(response, authUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateGoogleConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=google&googleError=1");
      }
    }

    if (method === "GET" && path === "/dashboard/google/callback") {
      const code = sanitizeText(requestUrl.searchParams.get("code"));
      const state = sanitizeText(requestUrl.searchParams.get("state"));
      const oauthError = sanitizeText(requestUrl.searchParams.get("error"));

      if (oauthError) {
        await updateGoogleConnectionError(
          currentUser!.id,
          `A ligação Google foi cancelada: ${oauthError}.`
        );
        return redirect(response, "/dashboard?tab=google&googleError=1");
      }

      if (!code || !state) {
        await updateGoogleConnectionError(
          currentUser!.id,
          "O callback Google chegou sem code/state válidos."
        );
        return redirect(response, "/dashboard?tab=google&googleError=1");
      }

      try {
        await exchangeGoogleAuthorizationCodeForDashboard(currentUser!.id, { code, state });
        return redirect(response, "/dashboard?tab=google&googleLinked=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateGoogleConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=google&googleError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/google/sync-now") {
      try {
        await requestGoogleSyncNow(currentUser!.id);
        return redirect(response, "/dashboard?tab=google&googleSynced=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateGoogleConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=google&googleError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/google/disable") {
      await disableGoogleConnection(currentUser!.id);
      return redirect(response, "/dashboard?tab=google&googleDisabled=1");
    }

    if (method === "GET" && path === "/dashboard/notion/connect") {
      try {
        const authUrl = await requestNotionAuthUrl(currentUser!.id);
        return redirect(response, authUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateNotionConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }
    }

    if (method === "GET" && path === "/dashboard/notion/callback") {
      const code = sanitizeText(requestUrl.searchParams.get("code"));
      const state = sanitizeText(requestUrl.searchParams.get("state"));
      const oauthError = sanitizeText(requestUrl.searchParams.get("error"));

      if (oauthError) {
        await updateNotionConnectionError(
          currentUser!.id,
          `A ligação Notion foi cancelada: ${oauthError}.`
        );
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }

      if (!code || !state) {
        await updateNotionConnectionError(
          currentUser!.id,
          "O callback Notion chegou sem code/state válidos."
        );
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }

      try {
        await exchangeNotionAuthorizationCodeForDashboard(currentUser!.id, { code, state });
        return redirect(response, "/dashboard?tab=notion&notionLinked=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateNotionConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/notion/sync-now") {
      try {
        await requestNotionSyncNow(currentUser!.id);
        return redirect(response, "/dashboard?tab=notion&notionSynced=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateNotionConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/notion/disable") {
      try {
        await requestNotionDisable(currentUser!.id);
        await disableNotionConnection(currentUser!.id);
        return redirect(response, "/dashboard?tab=notion&notionDisabled=1");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateNotionConnectionError(currentUser!.id, message);
        return redirect(response, "/dashboard?tab=notion&notionError=1");
      }
    }

    if (method === "POST" && path === "/dashboard/admin/users/create") {
      if (!currentUser || currentUser.role !== "admin") {
        return writeHtml(response, 403, renderErrorVuePage("So os administradores podem criar contas."));
      }

      const body = parseFormBody(await readBody(request));
      const email = sanitizeText(body.email ?? null);
      const displayName = sanitizeText(body.displayName ?? null);
      const role =
        body.role === "admin" || body.role === "user" ? body.role : "user";

      if (!email) {
        return writeHtml(
          response,
          400,
          renderCreatedUserVuePage({
            admin: currentUser,
            error: "Tens de indicar um email para criar a conta."
          })
        );
      }

      try {
        const temporaryPassword = generateTemporaryPassword();
        const result = await createUser(pool, {
          email,
          displayName,
          role,
          temporaryPassword
        });

        return writeHtml(
          response,
          200,
          renderCreatedUserVuePage({
            admin: currentUser,
            createdUser: result.user,
            temporaryPassword
          })
        );
      } catch (error) {
        return writeHtml(
          response,
          400,
          renderCreatedUserVuePage({
            admin: currentUser,
            error: error instanceof Error ? error.message : String(error)
          })
        );
      }
    }

    if (method === "POST" && path === "/dashboard/admin/users/deactivate") {
      if (!currentUser || currentUser.role !== "admin") {
        return writeHtml(response, 403, renderErrorVuePage("So os administradores podem gerir utilizadores."));
      }

      const body = parseFormBody(await readBody(request));
      const targetUserId = sanitizeText(body.userId ?? null);

      try {
        await deactivateDashboardUser(currentUser, targetUserId);
        return redirect(response, "/dashboard?tab=users&usersMessage=Conta%20desativada%20com%20sucesso.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return redirect(response, `/dashboard?tab=users&usersError=${encodeURIComponent(message)}`);
      }
    }

    if (method === "POST" && path === "/dashboard/admin/users/activate") {
      if (!currentUser || currentUser.role !== "admin") {
        return writeHtml(response, 403, renderErrorVuePage("So os administradores podem gerir utilizadores."));
      }

      const body = parseFormBody(await readBody(request));
      const targetUserId = sanitizeText(body.userId ?? null);

      try {
        await activateDashboardUser(currentUser, targetUserId);
        return redirect(response, "/dashboard?tab=users&usersMessage=Conta%20reativada%20com%20sucesso.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return redirect(response, `/dashboard?tab=users&usersError=${encodeURIComponent(message)}`);
      }
    }

    if (method === "POST" && path === "/dashboard/admin/users/delete") {
      if (!currentUser || currentUser.role !== "admin") {
        return writeHtml(response, 403, renderErrorVuePage("So os administradores podem apagar utilizadores."));
      }

      const body = parseFormBody(await readBody(request));
      const targetUserId = sanitizeText(body.userId ?? null);

      try {
        await deleteDashboardUser(currentUser, targetUserId);
        return redirect(response, "/dashboard?tab=users&usersMessage=Conta%20apagada%20e%20dados%20associados%20removidos.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return redirect(response, `/dashboard?tab=users&usersError=${encodeURIComponent(message)}`);
      }
    }

    if (method === "POST" && path === "/webhooks/notion") {
      const rawBody = await readBody(request, MAX_NOTION_WEBHOOK_BODY_BYTES);
      verifyNotionWebhookSignature(rawBody, request.headers["x-notion-signature"]);
      await forwardNotionWebhook(rawBody, request.headers);
      return writeJson(response, 200, { success: true });
    }

    if (method === "POST" && path === "/dashboard/settings") {
      return redirect(response, "/dashboard");
    }

    writeHtml(response, 404, renderNotFoundVuePage());
  } catch (error) {
    console.error("[dashboard-service] Erro:", error);
    if (error instanceof HttpError) {
      return writeJson(response, error.statusCode, {
        success: false,
        error: error.message
      });
    }

    writeHtml(response, 500, renderErrorVuePage());
  }
});

server.listen(env.port, () => {
  console.log(`[dashboard-service] A escutar na porta ${env.port}`);
  startNotificationScheduler();
});

async function handleRuntimeConfigRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!isAuthorizedInternalRequest(request)) {
    writeJson(response, 401, {
      success: false,
      error: "Não autorizado."
    });
    return;
  }

  writeJson(response, 200, {
    success: true,
    configured: false,
    config: null
  });
}

async function handleRuntimeConfigResolveRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL
): Promise<void> {
  if (!isAuthorizedInternalRequest(request)) {
    writeJson(response, 401, {
      success: false,
      error: "Não autorizado."
    });
    return;
  }

  const channelId = sanitizeText(requestUrl.searchParams.get("channelId"));
  const externalUserId = sanitizeText(requestUrl.searchParams.get("userId"));
  const platform = parseConversationPlatform(requestUrl.searchParams.get("platform"));

  if (!channelId || !externalUserId) {
    writeJson(response, 400, {
      success: false,
      error: "Pedido incompleto."
    });
    return;
  }

  const settings = await getRuntimeSettingsByLinkedConversation(platform, channelId, externalUserId);
  const configured = Boolean(settings?.enabled && settings.conversationChannelId && settings.linkedUserId);

  writeJson(response, 200, {
    success: true,
    configured,
    config: configured
      ? {
          dashboardUserId: settings?.userId,
          platform: settings?.conversationPlatform,
          channelId: settings?.conversationChannelId,
          userId: settings?.linkedUserId,
          username: settings?.linkedUsername,
          isPrimary: settings?.isPrimary,
          linkedAt: settings?.linkedAt
        }
      : null
  });
}

async function handleLinkCodeClaimRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!isAuthorizedInternalRequest(request)) {
    writeJson(response, 401, {
      success: false,
      error: "Não autorizado."
    });
    return;
  }

  const payload = safeJsonParse(await readBody(request)) as
    | {
        code?: string;
        platform?: string;
        userId?: string;
        username?: string;
        channelId?: string;
      }
    | null;

  const code = normalizeLinkCode(payload?.code ?? "");
  const platform = parseConversationPlatform(payload?.platform);
  const userId = sanitizeText(payload?.userId ?? null);
  const username = sanitizeText(payload?.username ?? null);
  const channelId = sanitizeText(payload?.channelId ?? null);

  if (!code || !userId || !channelId) {
    writeJson(response, 400, {
      success: false,
      error: "Pedido incompleto."
    });
    return;
  }

  const settings = await getRuntimeSettingsByLinkCode(code);

  if (!settings) {
    writeJson(response, 400, {
      success: false,
      error: "Código inválido."
    });
    return;
  }

  if (
    settings?.enabled &&
    settings.conversationPlatform === platform &&
    settings.conversationChannelId &&
    settings.linkedUserId
  ) {
    if (
      settings.conversationPlatform === platform &&
      settings.conversationChannelId === channelId &&
      settings.linkedUserId === userId
    ) {
      const preferences = await ensureSleepNotificationPreferences(settings.userId);
      writeJson(response, 200, {
        success: true,
        alreadyLinked: true,
        setupPrompt: buildSleepPreferenceLinkPrompt(preferences),
        config: {
          platform: settings.conversationPlatform,
          channelId: settings.conversationChannelId,
          userId: settings.linkedUserId,
          username: settings.linkedUsername,
          isPrimary: settings.isPrimary,
          linkedAt: settings.linkedAt
        }
      });
      return;
    }

    writeJson(response, 409, {
      success: false,
      error: "Já existe outra conversa ligada ao bot. Remove a ligação atual na dashboard primeiro."
    });
    return;
  }

  if (!settings.linkCode || !settings.linkCodeExpiresAt) {
    writeJson(response, 400, {
      success: false,
      error: "Não existe nenhum código ativo neste momento."
    });
    return;
  }

  if (new Date(settings.linkCodeExpiresAt).getTime() <= Date.now()) {
    writeJson(response, 400, {
      success: false,
      error: "Código expirado. Gera um novo código na dashboard."
    });
    return;
  }

  const linked = await claimLinkCode({
    settingsId: settings.id,
    platform,
    channelId,
    userId,
    username
  });
  const preferences = await prepareSleepNotificationOnboarding(linked.userId);

  writeJson(response, 200, {
    success: true,
    setupPrompt: buildSleepPreferenceLinkPrompt(preferences),
    config: {
      platform: linked.conversationPlatform,
      channelId: linked.conversationChannelId,
      userId: linked.linkedUserId,
      username: linked.linkedUsername,
      isPrimary: linked.isPrimary,
      linkedAt: linked.linkedAt
    }
  });
}

async function getRuntimeSettings(userId: string): Promise<RuntimeSettings | null> {
  const result = await pool.query<RuntimeSettingsRow>(
    `
      SELECT
        id,
        user_id,
        COALESCE(conversation_platform, 'discord') AS conversation_platform,
        conversation_channel_id,
        enabled,
        is_primary,
        updated_at,
        linked_user_id,
        linked_username,
        linked_discord_user_id,
        linked_discord_username,
        linked_at,
        link_code,
        link_code_expires_at
      FROM dashboard_runtime_settings
      WHERE user_id = $1
      ORDER BY is_primary DESC, enabled DESC, updated_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRuntimeSettingsRow(row);
}

async function getRuntimeSettingsForPlatform(
  userId: string,
  platform: "discord" | "telegram"
): Promise<RuntimeSettings | null> {
  const result = await pool.query<RuntimeSettingsRow>(
    `
      SELECT
        id,
        user_id,
        COALESCE(conversation_platform, 'discord') AS conversation_platform,
        conversation_channel_id,
        enabled,
        is_primary,
        updated_at,
        linked_user_id,
        linked_username,
        linked_discord_user_id,
        linked_discord_username,
        linked_at,
        link_code,
        link_code_expires_at
      FROM dashboard_runtime_settings
      WHERE user_id = $1
        AND COALESCE(conversation_platform, 'discord') = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId, platform]
  );

  const row = result.rows[0];
  return row ? mapRuntimeSettingsRow(row) : null;
}

async function getRuntimeChatLinks(userId: string): Promise<RuntimeChatLinks> {
  const [discord, telegram] = await Promise.all([
    getRuntimeSettingsForPlatform(userId, "discord"),
    getRuntimeSettingsForPlatform(userId, "telegram")
  ]);

  return { discord, telegram };
}

async function getRuntimeSettingsByLinkedConversation(
  platform: "discord" | "telegram",
  channelId: string,
  externalUserId: string
): Promise<RuntimeSettings | null> {
  const result = await pool.query<RuntimeSettingsRow>(
    `
      SELECT
        id,
        user_id,
        COALESCE(conversation_platform, 'discord') AS conversation_platform,
        conversation_channel_id,
        enabled,
        is_primary,
        updated_at,
        linked_user_id,
        linked_username,
        linked_discord_user_id,
        linked_discord_username,
        linked_at,
        link_code,
        link_code_expires_at
      FROM dashboard_runtime_settings
      WHERE enabled = TRUE
        AND COALESCE(conversation_platform, 'discord') = $1
        AND conversation_channel_id = $2
        AND COALESCE(linked_user_id, linked_discord_user_id) = $3
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [platform, channelId, externalUserId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRuntimeSettingsRow(row);
}

async function getRuntimeSettingsByLinkCode(code: string): Promise<RuntimeSettings | null> {
  const result = await pool.query<RuntimeSettingsRow>(
    `
      SELECT
        id,
        user_id,
        COALESCE(conversation_platform, 'discord') AS conversation_platform,
        conversation_channel_id,
        enabled,
        is_primary,
        updated_at,
        linked_user_id,
        linked_username,
        linked_discord_user_id,
        linked_discord_username,
        linked_at,
        link_code,
        link_code_expires_at
      FROM dashboard_runtime_settings
      WHERE REGEXP_REPLACE(UPPER(COALESCE(link_code, '')), '[^A-Z0-9]', '', 'g') = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [code]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapRuntimeSettingsRow(row);
}

function mapRuntimeSettingsRow(row: RuntimeSettingsRow): RuntimeSettings {
  const platform = row.conversation_platform === "telegram" ? "telegram" : "discord";
  const linkedUserId = row.linked_user_id ?? row.linked_discord_user_id;
  const linkedUsername = row.linked_username ?? row.linked_discord_username;

  return {
    id: row.id,
    userId: row.user_id,
    conversationPlatform: platform,
    conversationChannelId: row.conversation_channel_id,
    enabled: row.enabled,
    isPrimary: row.is_primary,
    updatedAt: row.updated_at,
    linkedUserId,
    linkedUsername,
    linkedDiscordUserId: row.linked_discord_user_id ?? linkedUserId,
    linkedDiscordUsername: row.linked_discord_username ?? linkedUsername,
    linkedAt: row.linked_at,
    linkCode: row.link_code,
    linkCodeExpiresAt: row.link_code_expires_at
  };
}

function parseConversationPlatform(value: string | null | undefined): "discord" | "telegram" {
  return value === "telegram" ? "telegram" : "discord";
}

async function ensureRuntimeSettingsRow(
  userId: string,
  platform: "discord" | "telegram" = "discord"
): Promise<RuntimeSettings> {
  const existing = await getRuntimeSettingsForPlatform(userId, platform);
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO dashboard_runtime_settings (
        id,
        user_id,
        conversation_platform,
        conversation_channel_id,
        enabled
      )
      VALUES ($1, $2, $3, NULL, FALSE)
    `,
    [id, userId, platform]
  );

  const created = await getRuntimeSettingsForPlatform(userId, platform);
  if (!created) {
    throw new Error("Não foi possível inicializar a configuração da dashboard.");
  }

  return created;
}

async function ensureActiveLinkCode(
  userId: string,
  platform: "discord" | "telegram",
  settings: RuntimeSettings | null
): Promise<{ code: string; expiresAt: string } | null> {
  const row = settings ?? (await ensureRuntimeSettingsRow(userId, platform));

  if (row.enabled && row.conversationChannelId && row.linkedUserId) {
    return null;
  }

  if (row.linkCode && row.linkCodeExpiresAt) {
    const expiresAt = new Date(row.linkCodeExpiresAt).getTime();
    if (expiresAt > Date.now()) {
      return {
        code: row.linkCode,
        expiresAt: row.linkCodeExpiresAt
      };
    }
  }

  return rotateLinkCode(userId, platform, row.id);
}

async function rotateLinkCode(
  userId: string,
  platform: "discord" | "telegram" = "discord",
  existingId?: string
): Promise<{ code: string; expiresAt: string }> {
  const row = existingId
    ? await getRuntimeSettingsForPlatform(userId, platform)
    : await ensureRuntimeSettingsRow(userId, platform);
  const id = existingId ?? row?.id;

  if (!id) {
    throw new Error("Não foi possível gerar um código de ligação.");
  }

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await pool.query(
    `
      UPDATE dashboard_runtime_settings
      SET
        link_code = $2,
        link_code_expires_at = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [id, code, expiresAt]
  );

  return {
    code,
    expiresAt
  };
}

async function claimLinkCode(input: {
  settingsId: string;
  platform: "discord" | "telegram";
  channelId: string;
  userId: string;
  username: string | null;
}): Promise<RuntimeSettings> {
  await pool.query(
    `
      UPDATE dashboard_runtime_settings
      SET
        conversation_platform = $2,
        conversation_channel_id = $3,
        enabled = TRUE,
        is_primary = CASE
          WHEN is_primary = TRUE THEN TRUE
          WHEN NOT EXISTS (
            SELECT 1
            FROM dashboard_runtime_settings existing_primary
            WHERE existing_primary.user_id = dashboard_runtime_settings.user_id
              AND existing_primary.is_primary = TRUE
              AND existing_primary.id <> $1
          ) THEN TRUE
          ELSE FALSE
        END,
        linked_user_id = $4,
        linked_username = $5,
        linked_discord_user_id = CASE WHEN $2 = 'discord' THEN $4 ELSE linked_discord_user_id END,
        linked_discord_username = CASE WHEN $2 = 'discord' THEN $5 ELSE linked_discord_username END,
        linked_at = NOW(),
        link_code = NULL,
        link_code_expires_at = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [input.settingsId, input.platform, input.channelId, input.userId, input.username]
  );

  const updated = await getRuntimeSettingsByLinkedConversation(input.platform, input.channelId, input.userId);
  if (!updated) {
    throw new Error("Não foi possível concluir a ligação do chat.");
  }

  return updated;
}

async function unlinkChat(userId: string, platform: "discord" | "telegram"): Promise<void> {
  const row = await ensureRuntimeSettingsRow(userId, platform);
  const wasPrimary = row.isPrimary;

  await pool.query(
    `
      UPDATE dashboard_runtime_settings
      SET
        conversation_channel_id = NULL,
        enabled = FALSE,
        is_primary = FALSE,
        linked_user_id = NULL,
        linked_username = NULL,
        linked_discord_user_id = CASE WHEN conversation_platform = 'discord' THEN NULL ELSE linked_discord_user_id END,
        linked_discord_username = CASE WHEN conversation_platform = 'discord' THEN NULL ELSE linked_discord_username END,
        linked_at = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );

  if (wasPrimary) {
    await promoteFallbackPrimaryChat(userId);
  }

  await rotateLinkCode(userId, platform, row.id);
}

async function setPrimaryChat(userId: string, platform: "discord" | "telegram"): Promise<void> {
  const row = await getRuntimeSettingsForPlatform(userId, platform);
  if (!row?.enabled || !row.conversationChannelId || !row.linkedUserId) {
    throw new Error("Liga primeiro esse chat antes de o marcares como principal.");
  }

  await pool.query(
    `
      UPDATE dashboard_runtime_settings
      SET
        is_primary = CASE WHEN id = $2 THEN TRUE ELSE FALSE END,
        updated_at = CASE WHEN id = $2 THEN NOW() ELSE updated_at END
      WHERE user_id = $1
    `,
    [userId, row.id]
  );
}

async function promoteFallbackPrimaryChat(userId: string): Promise<void> {
  await pool.query(
    `
      UPDATE dashboard_runtime_settings
      SET is_primary = TRUE, updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM dashboard_runtime_settings
        WHERE user_id = $1
          AND enabled = TRUE
          AND conversation_channel_id IS NOT NULL
          AND linked_user_id IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      )
    `,
    [userId]
  );
}

async function handleNotificationPreferenceChatMessageRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (!isAuthorizedInternalRequest(request)) {
    writeJson(response, 401, {
      success: false,
      error: "Nao autorizado."
    });
    return;
  }

  const payload = safeJsonParse(await readBody(request)) as
    | {
        platform?: string;
        channelId?: string;
        userId?: string;
        text?: string;
      }
    | null;

  const platform = parseConversationPlatform(payload?.platform);
  const channelId = sanitizeText(payload?.channelId ?? null);
  const externalUserId = sanitizeText(payload?.userId ?? null);
  const text = sanitizeText(payload?.text ?? null);

  if (!channelId || !externalUserId || !text) {
    writeJson(response, 400, {
      success: false,
      error: "Pedido incompleto."
    });
    return;
  }

  const settings = await getRuntimeSettingsByLinkedConversation(platform, channelId, externalUserId);
  if (!settings?.enabled) {
    writeJson(response, 200, { success: true, handled: false });
    return;
  }

  const result = await handleSleepPreferenceChatText(settings.userId, text);
  writeJson(response, 200, {
    success: true,
    ...result
  });
}

async function handleSleepPreferenceChatText(
  userId: string,
  text: string
): Promise<{ handled: boolean; reply?: string }> {
  const preferences = await ensureSleepNotificationPreferences(userId);
  const normalized = normalizeLooseText(text);
  const ranges = parseSleepWakeRanges(text);
  const range = parseTimeRange(text);
  const wantsStatus =
    /\b(horarios?|notificacoes?|notificações|sono|dormir|acordar)\b/.test(normalized) &&
    /\b(ver|mostrar|quais|estado|status|config)\b/.test(normalized);

  if (/\b(desativar|desligar|parar|off)\b/.test(normalized) && /\b(notificacoes?|notificações|avisos?)\b/.test(normalized)) {
    await setSleepNotificationsEnabled(userId, false);
    return {
      handled: true,
      reply: "Combinado. Desativei os avisos automaticos de noite e de manha. Podes voltar a ligar com `notificacoes on`."
    };
  }

  if (/\b(ativar|ligar|on)\b/.test(normalized) && /\b(notificacoes?|notificações|avisos?)\b/.test(normalized)) {
    await setSleepNotificationsEnabled(userId, true);
    const updated = await ensureSleepNotificationPreferences(userId);
    return {
      handled: true,
      reply: buildSleepPreferenceLinkPrompt(updated)
    };
  }

  if (wantsStatus) {
    return {
      handled: true,
      reply: buildSleepPreferenceStatusMessage(preferences)
    };
  }

  // Mensagens de calendario (marcar/criar/agendar/apagar eventos) tem prioridade:
  // nao as tratamos como preferencias de notificacao, mesmo que contenham um
  // intervalo horario ou palavras como "manha" (ex.: "marca amanha ... das 8 as 9").
  // Deixamos seguir para o orquestrador tratar como evento.
  if (
    /\b(marca|marcar|marque|agenda|agendar|agende|cria|criar|adiciona|adicionar|regista|registar|remarca|remarcar|apaga|apagar|cancela|cancelar)\b/.test(
      normalized
    )
  ) {
    return { handled: false };
  }

  if (ranges.sleep || ranges.wake) {
    if (ranges.sleep) {
      await updateSleepRange(userId, ranges.sleep.start, ranges.sleep.end);
    }

    if (ranges.wake) {
      await updateWakeRange(userId, ranges.wake.start, ranges.wake.end);
    }

    const updated = await ensureSleepNotificationPreferences(userId);
    return {
      handled: true,
      reply:
        ranges.sleep && ranges.wake
          ? buildSleepPreferenceStatusMessage(updated)
          : buildSleepPreferenceLinkPrompt(updated)
    };
  }

  if (!range) {
    return { handled: false };
  }

  const isWakeText = /\b(acord|levantar|manha|manhã)\b/.test(normalized);
  const isSleepText = /\b(sono|dormir|deitar|noite)\b/.test(normalized);
  const target =
    isWakeText || preferences.onboardingStep === "wake"
      ? "wake"
      : isSleepText || preferences.onboardingStep === "sleep"
        ? "sleep"
        : null;

  if (!target) {
    return { handled: false };
  }

  if (target === "sleep") {
    await updateSleepRange(userId, range.start, range.end);
    const updated = await ensureSleepNotificationPreferences(userId);
    return {
      handled: true,
      reply: updated.wakeStartTime && updated.wakeEndTime
        ? buildSleepPreferenceStatusMessage(updated)
        : "Perfeito. Guardei o intervalo de deitar. Agora diz-me o intervalo em que costumas acordar, por exemplo: `acordar 07-09`."
    };
  }

  await updateWakeRange(userId, range.start, range.end);
  const updated = await ensureSleepNotificationPreferences(userId);
  return {
    handled: true,
    reply: buildSleepPreferenceStatusMessage(updated)
  };
}

async function ensureSleepNotificationPreferences(userId: string): Promise<SleepNotificationPreferences> {
  const existing = await getSleepNotificationPreferences(userId);
  if (existing) {
    return existing;
  }

  await pool.query(
    `
      INSERT INTO sleep_notification_preferences (user_id, enabled, onboarding_step)
      VALUES ($1, TRUE, 'sleep')
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId]
  );

  const created = await getSleepNotificationPreferences(userId);
  if (!created) {
    throw new Error("Nao foi possivel inicializar as preferencias de notificacao.");
  }

  return created;
}

async function prepareSleepNotificationOnboarding(userId: string): Promise<SleepNotificationPreferences> {
  const preferences = await ensureSleepNotificationPreferences(userId);
  const nextStep =
    !preferences.sleepStartTime || !preferences.sleepEndTime
      ? "sleep"
      : !preferences.wakeStartTime || !preferences.wakeEndTime
        ? "wake"
        : null;

  if (preferences.onboardingStep !== nextStep) {
    await pool.query(
      `
        UPDATE sleep_notification_preferences
        SET onboarding_step = $2, updated_at = NOW()
        WHERE user_id = $1
      `,
      [userId, nextStep]
    );
  }

  return (await getSleepNotificationPreferences(userId)) ?? preferences;
}

async function getSleepNotificationPreferences(
  userId: string
): Promise<SleepNotificationPreferences | null> {
  const result = await pool.query<SleepNotificationPreferencesRow>(
    `
      SELECT
        user_id,
        enabled,
        sleep_start_time,
        sleep_end_time,
        wake_start_time,
        wake_end_time,
        onboarding_step,
        last_evening_sent_on::text AS last_evening_sent_on,
        last_morning_sent_on::text AS last_morning_sent_on,
        updated_at
      FROM sleep_notification_preferences
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  return row ? mapSleepNotificationPreferencesRow(row) : null;
}

function mapSleepNotificationPreferencesRow(
  row: SleepNotificationPreferencesRow
): SleepNotificationPreferences {
  return {
    userId: row.user_id,
    enabled: row.enabled,
    sleepStartTime: normalizeClockInput(row.sleep_start_time ?? ""),
    sleepEndTime: normalizeClockInput(row.sleep_end_time ?? ""),
    wakeStartTime: normalizeClockInput(row.wake_start_time ?? ""),
    wakeEndTime: normalizeClockInput(row.wake_end_time ?? ""),
    onboardingStep: row.onboarding_step === "wake" || row.onboarding_step === "sleep" ? row.onboarding_step : null,
    lastEveningSentOn: row.last_evening_sent_on,
    lastMorningSentOn: row.last_morning_sent_on,
    updatedAt: row.updated_at
  };
}

async function updateSleepRange(userId: string, start: string, end: string): Promise<void> {
  await pool.query(
    `
      UPDATE sleep_notification_preferences
      SET
        enabled = TRUE,
        sleep_start_time = $2,
        sleep_end_time = $3,
        onboarding_step = CASE
          WHEN wake_start_time IS NULL OR wake_end_time IS NULL THEN 'wake'
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, start, end]
  );
}

async function updateWakeRange(userId: string, start: string, end: string): Promise<void> {
  await pool.query(
    `
      UPDATE sleep_notification_preferences
      SET
        enabled = TRUE,
        wake_start_time = $2,
        wake_end_time = $3,
        onboarding_step = CASE
          WHEN sleep_start_time IS NULL OR sleep_end_time IS NULL THEN 'sleep'
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, start, end]
  );
}

async function setSleepNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  await ensureSleepNotificationPreferences(userId);
  await pool.query(
    `
      UPDATE sleep_notification_preferences
      SET enabled = $2, updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, enabled]
  );
}

async function saveSleepNotificationPreferencesFromDashboard(
  userId: string,
  input: {
    enabled: boolean;
    sleepStartTime: string | null;
    sleepEndTime: string | null;
    wakeStartTime: string | null;
    wakeEndTime: string | null;
  }
): Promise<void> {
  await ensureSleepNotificationPreferences(userId);
  await pool.query(
    `
      UPDATE sleep_notification_preferences
      SET
        enabled = $2,
        sleep_start_time = $3,
        sleep_end_time = $4,
        wake_start_time = $5,
        wake_end_time = $6,
        onboarding_step = CASE
          WHEN $3::TIME IS NULL OR $4::TIME IS NULL THEN 'sleep'
          WHEN $5::TIME IS NULL OR $6::TIME IS NULL THEN 'wake'
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [
      userId,
      input.enabled,
      input.sleepStartTime,
      input.sleepEndTime,
      input.wakeStartTime,
      input.wakeEndTime
    ]
  );
}

function buildSleepPreferenceLinkPrompt(preferences: SleepNotificationPreferences): string {
  if (
    preferences.sleepStartTime &&
    preferences.sleepEndTime &&
    preferences.wakeStartTime &&
    preferences.wakeEndTime
  ) {
    return [
      "Avisos automaticos ativos:",
      `- deitar: ${formatClockRange(preferences.sleepStartTime, preferences.sleepEndTime)}`,
      `- acordar: ${formatClockRange(preferences.wakeStartTime, preferences.wakeEndTime)}`,
      "Podes alterar quando quiseres com `sono 23-01` ou `acordar 07-09`."
    ].join("\n");
  }

  if (preferences.onboardingStep === "wake") {
    return "Falta-me o intervalo em que costumas acordar. Podes dizer, por exemplo: `acordar 08-10`.";
  }

  return "Para uma melhor experiencia, diz-me o intervalo em que costumas deitar-te e acordar. Exemplo: `Dormir das 23 as 01 e acordo por volta das 08 as 10`.";
}

function buildSleepPreferenceStatusMessage(preferences: SleepNotificationPreferences): string {
  const sleepRange =
    preferences.sleepStartTime && preferences.sleepEndTime
      ? formatClockRange(preferences.sleepStartTime, preferences.sleepEndTime)
      : "por configurar";
  const wakeRange =
    preferences.wakeStartTime && preferences.wakeEndTime
      ? formatClockRange(preferences.wakeStartTime, preferences.wakeEndTime)
      : "por configurar";

  return [
    preferences.enabled ? "Avisos automaticos ligados." : "Avisos automaticos desligados.",
    `Deitar: ${sleepRange}.`,
    `Acordar: ${wakeRange}.`,
    "Podes alterar com `sono 23-01`, `acordar 07-09`, `notificacoes off` ou `notificacoes on`."
  ].join("\n");
}

function startNotificationScheduler(): void {
  const run = async () => {
    try {
      await processSleepNotifications();
    } catch (error) {
      console.error("[dashboard-service] Erro no scheduler de notificacoes:", error);
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, NOTIFICATION_SCHEDULER_INTERVAL_MS);
}

async function processSleepNotifications(): Promise<void> {
  const localNow = getLocalDateTimeParts(new Date(), env.timezone);
  const preferencesList = await listSleepNotificationPreferencesForScheduler();

  for (const preferences of preferencesList) {
    const primaryChat = await getRuntimeSettings(preferences.userId);
    if (!primaryChat?.enabled || !primaryChat.conversationChannelId || !primaryChat.linkedUserId) {
      continue;
    }

    if (
      preferences.sleepStartTime &&
      preferences.sleepEndTime &&
      preferences.lastEveningSentOn !== localNow.date &&
      isWithinPreferredWindow(preferences.sleepStartTime, preferences.sleepEndTime, localNow.minutes)
    ) {
      const message = await buildEveningNotificationMessage(preferences.userId, localNow.date);
      if (message) {
        await sendNotificationToChat(primaryChat, message);
        await markSleepNotificationSent(preferences.userId, "evening", localNow.date);
      }
    }

    if (
      preferences.wakeStartTime &&
      preferences.wakeEndTime &&
      preferences.lastMorningSentOn !== localNow.date &&
      isWithinPreferredWindow(preferences.wakeStartTime, preferences.wakeEndTime, localNow.minutes)
    ) {
      const message = await buildMorningNotificationMessage(preferences.userId, localNow.date);
      if (message) {
        await sendNotificationToChat(primaryChat, message);
        await markSleepNotificationSent(preferences.userId, "morning", localNow.date);
      }
    }
  }
}

async function listSleepNotificationPreferencesForScheduler(): Promise<SleepNotificationPreferences[]> {
  const result = await pool.query<SleepNotificationPreferencesRow>(
    `
      SELECT
        user_id,
        enabled,
        sleep_start_time,
        sleep_end_time,
        wake_start_time,
        wake_end_time,
        onboarding_step,
        last_evening_sent_on::text AS last_evening_sent_on,
        last_morning_sent_on::text AS last_morning_sent_on,
        updated_at
      FROM sleep_notification_preferences
      WHERE enabled = TRUE
        AND (
          (sleep_start_time IS NOT NULL AND sleep_end_time IS NOT NULL)
          OR (wake_start_time IS NOT NULL AND wake_end_time IS NOT NULL)
        )
    `
  );

  return result.rows.map(mapSleepNotificationPreferencesRow);
}

async function buildEveningNotificationMessage(userId: string, today: string): Promise<string | null> {
  const tomorrow = addDaysIso(today, 1);
  const afterTomorrow = addDaysIso(today, 2);
  const threeDaysEnd = addDaysIso(today, 3);
  const sevenDaysEnd = addDaysIso(today, 7);
  const tomorrowEvents = await searchCalendarEventsForUser(userId, {
    date: tomorrow,
    limit: 20
  });
  let upcomingLabel = "nos proximos 3 dias";
  let upcomingEvents = await searchCalendarEventsForUser(userId, {
    dateFrom: afterTomorrow,
    dateTo: threeDaysEnd,
    limit: 20
  });

  if (upcomingEvents.length === 0) {
    upcomingLabel = "nos proximos 7 dias";
    upcomingEvents = await searchCalendarEventsForUser(userId, {
      dateFrom: afterTomorrow,
      dateTo: sevenDaysEnd,
      limit: 30
    });
  }

  if (tomorrowEvents.length === 0 && upcomingEvents.length === 0) {
    return null;
  }

  const sections = ["Nao esquecer:"];
  if (tomorrowEvents.length > 0) {
    sections.push("", "Amanha tens:", ...formatEventLines(tomorrowEvents));
  }

  if (upcomingEvents.length > 0) {
    sections.push("", `Tambem ${upcomingLabel}:`, ...formatEventLines(upcomingEvents, { includeDate: true }));
  }

  return sections.join("\n");
}

async function buildMorningNotificationMessage(userId: string, today: string): Promise<string | null> {
  const events = await searchCalendarEventsForUser(userId, {
    date: today,
    limit: 20
  });

  if (events.length === 0) {
    return null;
  }

  return ["Bom dia. Hoje tens:", ...formatEventLines(events)].join("\n");
}

async function searchCalendarEventsForUser(
  userId: string,
  filters: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
): Promise<CalendarEventSummary[]> {
  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/events/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "search_events",
      filters: {
        ...filters,
        userId
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Calendar Service respondeu com ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    events?: CalendarEventSummary[];
  };

  return Array.isArray(body.events) ? body.events.sort(compareCalendarEventsByDateTime) : [];
}

async function sendNotificationToChat(settings: RuntimeSettings, message: string): Promise<void> {
  const gatewayUrl =
    settings.conversationPlatform === "telegram" ? env.telegramGatewayUrl : env.discordGatewayUrl;
  const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/internal/send-message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-token": env.internalApiToken
    },
    body: JSON.stringify({
      channelId: settings.conversationChannelId,
      message
    })
  });

  if (!response.ok) {
    throw new Error(`Gateway ${settings.conversationPlatform} respondeu com ${response.status}`);
  }
}

async function markSleepNotificationSent(
  userId: string,
  kind: "evening" | "morning",
  localDate: string
): Promise<void> {
  await pool.query(
    `
      UPDATE sleep_notification_preferences
      SET
        last_evening_sent_on = CASE WHEN $2 = 'evening' THEN $3 ELSE last_evening_sent_on END,
        last_morning_sent_on = CASE WHEN $2 = 'morning' THEN $3 ELSE last_morning_sent_on END,
        updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId, kind, localDate]
  );
}

function formatEventLines(
  events: CalendarEventSummary[],
  options: { includeDate?: boolean } = {}
): string[] {
  return events.map((event, index) => `${index + 1}. ${formatNotificationEvent(event, options)}`);
}

function formatNotificationEvent(
  event: CalendarEventSummary,
  options: { includeDate?: boolean }
): string {
  const timeLabel = event.allDay ? "dia todo" : event.startTime ? event.startTime.slice(0, 5) : "sem hora";
  const dateLabel = options.includeDate ? `${formatShortDate(event.date)} - ` : "";
  return `${dateLabel}${timeLabel} ${event.title}`.trim();
}

function compareCalendarEventsByDateTime(left: CalendarEventSummary, right: CalendarEventSummary): number {
  const leftKey = `${left.date} ${left.startTime ?? "00:00"}`;
  const rightKey = `${right.date} ${right.startTime ?? "00:00"}`;
  return leftKey.localeCompare(rightKey);
}

function parseTimeRange(text: string): { start: string; end: string } | null {
  const normalized = text
    .toLowerCase()
    .replace(/\bàs\b/g, "as")
    .replace(/\bat[eé]\b/g, "-")
    .replace(/\bdas\b/g, " ")
    .replace(/\bda\b/g, " ")
    .replace(/\s+/g, " ");
  const match = normalized.match(/(\d{1,2})(?::?(\d{2}))?\s*(?:-|a|ate|as)\s*(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    return null;
  }

  const start = normalizeClockParts(match[1], match[2]);
  const end = normalizeClockParts(match[3], match[4]);
  return start && end ? { start, end } : null;
}

function parseSleepWakeRanges(text: string): {
  sleep: { start: string; end: string } | null;
  wake: { start: string; end: string } | null;
} {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  return {
    sleep: parseLabeledTimeRange(normalized, ["dormir", "sono", "deitar", "deito", "deitar-me"]),
    wake: parseLabeledTimeRange(normalized, ["acordo", "acordar", "levanto", "levantar", "manha"])
  };
}

function parseLabeledTimeRange(text: string, labels: string[]): { start: string; end: string } | null {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const labelPattern = `(?:${escapedLabels.join("|")})`;
  const rangePattern = String.raw`(?:\bpor volta\b|\bdas\b|\bda\b|\bentre\b|\bde\b|\bas\b|\s)*(\d{1,2})(?::?(\d{2}))?\s*(?:-|a|ate|as)\s*(\d{1,2})(?::?(\d{2}))?`;
  const match = text.match(new RegExp(`\\b${labelPattern}\\b.{0,40}?${rangePattern}`, "i"));

  if (!match) {
    return null;
  }

  const start = normalizeClockParts(match[1], match[2]);
  const end = normalizeClockParts(match[3], match[4]);
  return start && end ? { start, end } : null;
}

function normalizeClockParts(hourValue: string, minuteValue?: string): string | null {
  const hour = Number(hourValue);
  const minute = minuteValue ? Number(minuteValue) : 0;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeClockInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/);
  return match ? normalizeClockParts(match[1], match[2]) : null;
}

function formatClockRange(start: string, end: string): string {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}

function isWithinPreferredWindow(start: string, end: string, currentMinutes: number): boolean {
  const startMinutes = clockToMinutes(start);
  const endMinutes = clockToMinutes(end);
  const totalMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  const preferredMinutes = Math.max(1, Math.ceil(totalMinutes / 4));
  let elapsedMinutes = currentMinutes - startMinutes;
  if (elapsedMinutes < 0) {
    elapsedMinutes += 1440;
  }

  return elapsedMinutes >= 0 && elapsedMinutes <= preferredMinutes;
}

function clockToMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.slice(0, 5).split(":");
  return Number(hour) * 60 + Number(minute);
}

function getLocalDateTimeParts(date: Date, timezone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const hour = Number(part("hour")) % 24;
  const minute = Number(part("minute"));

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: hour * 60 + minute
  };
}

function addDaysIso(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${date}T00:00:00Z`));
}

async function getAppleCalendarConnection(userId: string): Promise<AppleCalendarConnection | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
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
  }>(
    `
      SELECT *
      FROM apple_calendar_connections
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    enabled: row.enabled,
    accountEmail: row.account_email,
    defaultCalendarId: row.selected_calendar_id,
    defaultCalendarName: row.selected_calendar_name,
    discoveredCalendars: safeJsonParse(row.discovered_calendars_json ?? "[]") as AppleCalendarOption[],
    syncMode: row.sync_mode || "bidirectional",
    lastTestedAt: row.last_tested_at?.toISOString() ?? null,
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    lastError: row.last_error,
    hasStoredSecret: Boolean(row.app_specific_password_encrypted),
    storedSecretEncrypted: row.app_specific_password_encrypted
  };
}

async function ensureAppleConnectionRow(userId: string): Promise<AppleCalendarConnection> {
  const existing = await getAppleCalendarConnection(userId);
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO apple_calendar_connections (
        id,
        user_id,
        enabled,
        sync_mode
      )
      VALUES ($1, $2, FALSE, 'bidirectional')
    `,
    [id, userId]
  );

  const created = await getAppleCalendarConnection(userId);
  if (!created) {
    throw new Error("Não foi possível inicializar a configuração Apple.");
  }

  return created;
}

async function saveAppleConnectionDraft(input: {
  userId: string;
  accountEmail: string;
  appSpecificPassword: string;
  calendars: AppleCalendarOption[];
  defaultCalendarId: string | null;
  defaultCalendarName: string | null;
  enabled: boolean;
  syncMode: string;
}): Promise<void> {
  const row = await ensureAppleConnectionRow(input.userId);
  const encryptedSecret = encryptSecret(input.appSpecificPassword, env.configEncryptionKey);

  await pool.query(
    `
      UPDATE apple_calendar_connections
      SET
        enabled = $2,
        account_email = $3,
        app_specific_password_encrypted = $4,
        selected_calendar_id = $5,
        selected_calendar_name = $6,
        discovered_calendars_json = $7,
        sync_mode = $8,
        last_tested_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      row.id,
      input.enabled,
      input.accountEmail,
      encryptedSecret,
      input.defaultCalendarId,
      input.defaultCalendarName,
      JSON.stringify(input.calendars),
      input.syncMode
    ]
  );
}

async function updateAppleConnectionError(userId: string, message: string): Promise<void> {
  const row = await ensureAppleConnectionRow(userId);

  await pool.query(
    `
      UPDATE apple_calendar_connections
      SET
        last_error = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id, message]
  );
}

async function disableAppleConnection(userId: string): Promise<void> {
  const row = await ensureAppleConnectionRow(userId);

  await pool.query(
    `
      UPDATE apple_calendar_connections
      SET
        enabled = FALSE,
        account_email = NULL,
        app_specific_password_encrypted = NULL,
        selected_calendar_id = NULL,
        selected_calendar_name = NULL,
        discovered_calendars_json = '[]',
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );
}

async function getGoogleCalendarConnection(userId: string): Promise<GoogleCalendarConnection | null> {
  const result = await pool.query<{
    id: string;
    user_id: string;
    enabled: boolean;
    account_email: string | null;
    selected_calendar_id: string | null;
    selected_calendar_name: string | null;
    discovered_calendars_json: string | null;
    sync_mode: string;
    last_tested_at: Date | null;
    last_sync_at: Date | null;
    last_error: string | null;
  }>(
    `
      SELECT *
      FROM google_calendar_connections
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    enabled: row.enabled,
    accountEmail: row.account_email,
    defaultCalendarId: row.selected_calendar_id,
    defaultCalendarName: row.selected_calendar_name,
    discoveredCalendars: safeJsonParse(row.discovered_calendars_json ?? "[]") as GoogleCalendarOption[],
    syncMode: row.sync_mode || "bidirectional",
    lastTestedAt: row.last_tested_at?.toISOString() ?? null,
    lastSyncAt: row.last_sync_at?.toISOString() ?? null,
    lastError: row.last_error
  };
}

async function ensureGoogleConnectionRow(userId: string): Promise<GoogleCalendarConnection> {
  const existing = await getGoogleCalendarConnection(userId);
  if (existing) {
    return existing;
  }

  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO google_calendar_connections (
        id,
        user_id,
        enabled,
        sync_mode
      )
      VALUES ($1, $2, FALSE, 'bidirectional')
    `,
    [id, userId]
  );

  const created = await getGoogleCalendarConnection(userId);
  if (!created) {
    throw new Error("Não foi possível inicializar a configuração Google.");
  }

  return created;
}

async function updateGoogleConnectionError(userId: string, message: string): Promise<void> {
  const row = await ensureGoogleConnectionRow(userId);

  await pool.query(
    `
      UPDATE google_calendar_connections
      SET
        last_error = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id, message]
  );
}

async function disableGoogleConnection(userId: string): Promise<void> {
  const row = await ensureGoogleConnectionRow(userId);

  await pool.query(
    `
      UPDATE google_calendar_connections
      SET
        enabled = FALSE,
        account_email = NULL,
        access_token_encrypted = NULL,
        refresh_token_encrypted = NULL,
        token_expiry = NULL,
        selected_calendar_id = NULL,
        selected_calendar_name = NULL,
        discovered_calendars_json = '[]',
        oauth_state = NULL,
        oauth_state_expires_at = NULL,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );
}

async function getNotionConnection(userId: string): Promise<NotionConnection | null> {
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/summary`, {
    method: "GET",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        connection?: NotionConnection | null;
      }
    | null;

  return body?.success === true ? body.connection ?? null : null;
}

async function updateNotionConnectionError(userId: string, message: string): Promise<void> {
  const row = await ensureNotionConnectionRow(userId);

  await pool.query(
    `
      UPDATE notion_connections
      SET
        last_error = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id, message]
  );
}

async function disableNotionConnection(userId: string): Promise<void> {
  const row = await ensureNotionConnectionRow(userId);

  await pool.query(
    `
      UPDATE notion_connections
      SET
        enabled = FALSE,
        workspace_id = NULL,
        workspace_name = NULL,
        workspace_icon = NULL,
        database_id = NULL,
        database_url = NULL,
        last_error = NULL,
        updated_at = NOW()
      WHERE id = $1
    `,
    [row.id]
  );
}

async function ensureNotionConnectionRow(userId: string): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM notion_connections
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId]
  );

  if (result.rows[0]?.id) {
    return { id: result.rows[0].id };
  }

  const id = randomUUID();
  await pool.query(
    `
      INSERT INTO notion_connections (
        id,
        user_id,
        enabled,
        sync_mode
      )
      VALUES ($1, $2, FALSE, 'bidirectional')
    `,
    [id, userId]
  );

  return { id };
}

async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_runtime_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
        conversation_platform TEXT NOT NULL DEFAULT 'discord',
        conversation_channel_id TEXT,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        is_primary BOOLEAN NOT NULL DEFAULT FALSE,
        linked_user_id TEXT,
      linked_username TEXT,
      linked_discord_user_id TEXT,
      linked_discord_username TEXT,
      linked_at TIMESTAMPTZ,
      link_code TEXT,
      link_code_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE dashboard_runtime_settings
      ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS conversation_platform TEXT NOT NULL DEFAULT 'discord',
      ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS linked_user_id TEXT,
      ADD COLUMN IF NOT EXISTS linked_username TEXT,
      ADD COLUMN IF NOT EXISTS linked_discord_user_id TEXT,
      ADD COLUMN IF NOT EXISTS linked_discord_username TEXT,
      ADD COLUMN IF NOT EXISTS linked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS link_code TEXT,
      ADD COLUMN IF NOT EXISTS link_code_expires_at TIMESTAMPTZ;
  `);

  await pool.query(`
    UPDATE dashboard_runtime_settings
    SET
      conversation_platform = COALESCE(conversation_platform, 'discord'),
      linked_user_id = COALESCE(linked_user_id, linked_discord_user_id),
      linked_username = COALESCE(linked_username, linked_discord_username)
    WHERE linked_user_id IS NULL
       OR linked_username IS NULL
       OR conversation_platform IS NULL
  `);

  await pool.query(`
    UPDATE dashboard_runtime_settings primary_candidate
    SET is_primary = TRUE
    WHERE primary_candidate.enabled = TRUE
      AND primary_candidate.is_primary = FALSE
      AND NOT EXISTS (
        SELECT 1
        FROM dashboard_runtime_settings existing_primary
        WHERE existing_primary.user_id = primary_candidate.user_id
          AND existing_primary.is_primary = TRUE
      )
      AND primary_candidate.id = (
        SELECT newest_enabled.id
        FROM dashboard_runtime_settings newest_enabled
        WHERE newest_enabled.user_id = primary_candidate.user_id
          AND newest_enabled.enabled = TRUE
        ORDER BY newest_enabled.updated_at DESC
        LIMIT 1
      )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_runtime_settings_user
    ON dashboard_runtime_settings (user_id)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_runtime_settings_user_platform
    ON dashboard_runtime_settings (user_id, conversation_platform)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_dashboard_runtime_settings_platform_conversation
    ON dashboard_runtime_settings (conversation_platform, conversation_channel_id, linked_user_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sleep_notification_preferences (
      user_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      sleep_start_time TIME NULL,
      sleep_end_time TIME NULL,
      wake_start_time TIME NULL,
      wake_end_time TIME NULL,
      onboarding_step TEXT NULL,
      last_evening_sent_on DATE NULL,
      last_morning_sent_on DATE NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE sleep_notification_preferences
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS sleep_start_time TIME NULL,
      ADD COLUMN IF NOT EXISTS sleep_end_time TIME NULL,
      ADD COLUMN IF NOT EXISTS wake_start_time TIME NULL,
      ADD COLUMN IF NOT EXISTS wake_end_time TIME NULL,
      ADD COLUMN IF NOT EXISTS onboarding_step TEXT NULL,
      ADD COLUMN IF NOT EXISTS last_evening_sent_on DATE NULL,
      ADD COLUMN IF NOT EXISTS last_morning_sent_on DATE NULL;
  `);

  await pool.query(`
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
    );
  `);

  await pool.query(`
    ALTER TABLE apple_calendar_connections
      ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS selected_calendar_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS discovered_calendars_json TEXT NULL,
      ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_apple_calendar_connections_user
    ON apple_calendar_connections (user_id)
  `);

  await pool.query(`
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
    );
  `);

  await pool.query(`
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
      ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_user
    ON google_calendar_connections (user_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notion_connections (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      workspace_id TEXT NULL,
      workspace_name TEXT NULL,
      workspace_icon TEXT NULL,
      database_id TEXT NULL,
      database_url TEXT NULL,
      sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      last_error TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE notion_connections
      ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS workspace_icon TEXT NULL,
      ADD COLUMN IF NOT EXISTS database_id TEXT NULL,
      ADD COLUMN IF NOT EXISTS database_url TEXT NULL,
      ADD COLUMN IF NOT EXISTS sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
      ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notion_connections_user
    ON notion_connections (user_id)
  `);
}

async function getDiscordBotIdentity(force = false): Promise<DiscordBotIdentity | null> {
  if (!env.discordToken) {
    return null;
  }

  const cacheTtlMs = 5 * 60 * 1000;
  if (!force && Date.now() - botIdentityCache.loadedAt < cacheTtlMs) {
    return botIdentityCache.value;
  }

  try {
    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bot ${env.discordToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Discord API respondeu com ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    const avatarUrl = body.avatar
      ? `https://cdn.discordapp.com/avatars/${body.id}/${body.avatar}.png?size=128`
      : null;

    const identity: DiscordBotIdentity = {
      id: body.id,
      username: body.username,
      globalName: body.global_name ?? null,
      avatarUrl
    };

    botIdentityCache = {
      value: identity,
      loadedAt: Date.now()
    };

    return identity;
  } catch (error) {
    console.log(
      `[dashboard-service] Não foi possível carregar a identidade do bot no Discord: ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    botIdentityCache = {
      value: null,
      loadedAt: Date.now()
    };

    return null;
  }
}

function redirect(response: ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader("Location", location);
  response.end();
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const content = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(content);
}

function writeHtml(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(body);
}

async function handlePublicAssetRequest(
  response: ServerResponse,
  pathname: string
): Promise<void> {
  return servePublicAssetRequest(response, pathname);
}

function getAssetContentType(pathname: string): string {
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

  return "application/octet-stream";
}

function getMarketingContactEmail(): string {
  return (
    sanitizeText(env.contactEmail) ??
    sanitizeText(env.defaultAdminEmail) ??
    "miguelcrespovenancio@hotmail.com"
  );
}

async function requireManageableUser(currentUser: AppUser, targetUserId: string | null): Promise<AppUser> {
  if (!targetUserId) {
    throw new Error("Utilizador inválido.");
  }

  const targetUser = await getUserById(pool, targetUserId);
  if (!targetUser) {
    throw new Error("Não encontrei o utilizador pedido.");
  }

  if (targetUser.id === currentUser.id) {
    throw new Error("Não podes executar esta ação sobre a tua própria conta.");
  }

  return targetUser;
}

async function assertNotLastActiveAdmin(targetUser: AppUser): Promise<void> {
  if (targetUser.role !== "admin" || !targetUser.active) {
    return;
  }

  const activeAdmins = await countActiveAdmins(pool);
  if (activeAdmins <= 1) {
    throw new Error("Tens de manter pelo menos um administrador ativo.");
  }
}

async function deactivateDashboardUser(currentUser: AppUser, targetUserId: string | null): Promise<void> {
  const targetUser = await requireManageableUser(currentUser, targetUserId);

  if (!targetUser.active) {
    return;
  }

  await assertNotLastActiveAdmin(targetUser);
  await setUserActiveState(pool, targetUser.id, false);
}

async function activateDashboardUser(currentUser: AppUser, targetUserId: string | null): Promise<void> {
  const targetUser = await requireManageableUser(currentUser, targetUserId);
  await setUserActiveState(pool, targetUser.id, true);
}

async function deleteDashboardUser(currentUser: AppUser, targetUserId: string | null): Promise<void> {
  const targetUser = await requireManageableUser(currentUser, targetUserId);
  await assertNotLastActiveAdmin(targetUser);

  const settings = await getRuntimeSettings(targetUser.id);

  await requestCalendarUserPurge(targetUser.id);

  if (settings?.conversationChannelId) {
    await requestOrchestratorConversationPurge(settings.conversationChannelId);
  }

  await pool.query(`DELETE FROM dashboard_runtime_settings WHERE user_id = $1`, [targetUser.id]);
  await pool.query(`DELETE FROM sleep_notification_preferences WHERE user_id = $1`, [targetUser.id]);
  await pool.query(`DELETE FROM apple_calendar_connections WHERE user_id = $1`, [targetUser.id]);
  await pool.query(`DELETE FROM google_calendar_connections WHERE user_id = $1`, [targetUser.id]);
  await pool.query(`DELETE FROM notion_connections WHERE user_id = $1`, [targetUser.id]);
  await deleteUserIdentity(pool, targetUser.id);
}

async function requestCalendarUserPurge(discordUserId: string): Promise<void> {
  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/internal/users/purge`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({
      userId: discordUserId
    })
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error ?? "Não consegui limpar os eventos associados ao utilizador.");
  }
}

async function requestOrchestratorConversationPurge(channelId: string): Promise<void> {
  const response = await fetch(`${env.orchestratorUrl.replace(/\/$/, "")}/internal/conversations/purge`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify({
      channelId
    })
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error ?? "Não consegui limpar o histórico da conversa associada.");
  }
}

async function readBody(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BODY_BYTES
): Promise<string> {
  const contentLength = Number(request.headers["content-length"] ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new HttpError(413, "Pedido demasiado grande.");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, "Pedido demasiado grande.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf-8");
}

function verifyNotionWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined
): void {
  const verificationToken = env.notionWebhookVerificationToken.trim();
  if (!verificationToken) {
    throw new HttpError(503, "Webhook Notion sem segredo de verificação configurado.");
  }

  const signature = getHeaderValue(signatureHeader);
  if (!signature) {
    if (isValidNotionWebhookSignature(rawBody, undefined, verificationToken)) {
      return;
    }
    throw new HttpError(401, "Assinatura do webhook Notion em falta.");
  }

  if (!isValidNotionWebhookSignature(rawBody, signature, verificationToken)) {
    throw new HttpError(401, "Assinatura do webhook Notion inválida.");
  }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseFormBody(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body).entries());
}

function sanitizeText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveApplePasswordInput(
  inputPassword: string,
  existing: AppleCalendarConnection | null,
  requestedEmail: string | null
): string | null {
  const direct = sanitizeText(inputPassword);
  if (direct) {
    return direct;
  }

  if (!existing?.storedSecretEncrypted || !existing.accountEmail) {
    return null;
  }

  if (requestedEmail && existing.accountEmail !== requestedEmail) {
    return null;
  }

  if (!env.configEncryptionKey) {
    return null;
  }

  return decryptSecret(existing.storedSecretEncrypted, env.configEncryptionKey);
}

async function requestAppleCalendarTest(input: {
  accountEmail: string;
  appSpecificPassword: string;
}): Promise<{ calendars: AppleCalendarOption[]; defaultCalendar: AppleCalendarOption }> {
  const response = await fetch(`${env.appleConnectorUrl}/providers/apple/test`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken
    },
    body: JSON.stringify(input)
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
        calendars?: AppleCalendarOption[];
        defaultCalendar?: AppleCalendarOption;
      }
    | null;

  if (
    !response.ok ||
    body?.success !== true ||
    !Array.isArray(body?.calendars) ||
    !body?.defaultCalendar ||
    typeof body.defaultCalendar.id !== "string"
  ) {
    throw new Error(body?.error ?? "Não consegui testar a ligação ao Apple Calendar.");
  }

  return {
    calendars: body.calendars,
    defaultCalendar: body.defaultCalendar
  };
}

async function requestAppleSyncNow(userId: string): Promise<void> {
  const response = await fetch(`${env.appleConnectorUrl}/providers/apple/sync-now`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        message?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.message ?? "Não consegui arrancar a sincronização Apple.");
  }
}

async function requestGoogleAuthUrl(userId: string): Promise<string> {
  const response = await fetch(`${env.googleConnectorUrl}/providers/google/auth-url`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
        url?: string;
      }
    | null;

  if (!response.ok || body?.success !== true || typeof body?.url !== "string") {
    throw new Error(body?.error ?? "Não consegui iniciar a ligação ao Google Calendar.");
  }

  return body.url;
}

async function exchangeGoogleAuthorizationCodeForDashboard(userId: string, input: {
  code: string;
  state: string;
}): Promise<void> {
  const response = await fetch(`${env.googleConnectorUrl}/providers/google/oauth/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    },
    body: JSON.stringify(input)
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error ?? "Não consegui concluir a ligação ao Google Calendar.");
  }
}

async function requestGoogleSyncNow(userId: string): Promise<void> {
  const response = await fetch(`${env.googleConnectorUrl}/providers/google/sync-now`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        message?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.message ?? "Não consegui arrancar a sincronização Google.");
  }
}

async function requestNotionAuthUrl(userId: string): Promise<string> {
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/auth-url`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
        url?: string;
      }
    | null;

  if (!response.ok || body?.success !== true || typeof body?.url !== "string") {
    throw new Error(body?.error ?? "Não consegui iniciar a ligação ao Notion.");
  }

  return body.url;
}

async function exchangeNotionAuthorizationCodeForDashboard(userId: string, input: {
  code: string;
  state: string;
}): Promise<void> {
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/oauth/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    },
    body: JSON.stringify(input)
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error ?? "Não consegui concluir a ligação ao Notion.");
  }
}

async function requestNotionSyncNow(userId: string): Promise<void> {
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/sync-now`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        message?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.message ?? "Não consegui arrancar a sincronização Notion.");
  }
}

async function requestNotionDisable(userId: string): Promise<void> {
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/disable`, {
    method: "POST",
    headers: {
      "x-internal-token": env.internalApiToken,
      "x-dashboard-user-id": userId
    }
  });

  const body = safeJsonParse(await response.text()) as
    | {
        success?: boolean;
        error?: string;
      }
    | null;

  if (!response.ok || body?.success !== true) {
    throw new Error(body?.error ?? "Não consegui desligar a integração Notion.");
  }
}

async function forwardNotionWebhook(
  rawBody: string,
  headers: IncomingMessage["headers"]
): Promise<void> {
  const notionSignature = getHeaderValue(headers["x-notion-signature"]);
  const response = await fetch(`${env.notionConnectorUrl}/providers/notion/webhook`, {
    method: "POST",
    headers: {
      "content-type": headers["content-type"] ?? "application/json; charset=utf-8",
      "x-internal-token": env.internalApiToken,
      ...(notionSignature ? { "x-notion-signature": notionSignature } : {})
    },
    body: rawBody
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function renderDashboardVuePage(
  currentUser: AppUser,
  users: AppUser[],
  settings: RuntimeSettings | null,
  chatLinks: RuntimeChatLinks,
  activeLinkCode: { code: string; expiresAt: string } | null,
  appleConnection: AppleCalendarConnection | null,
  googleConnection: GoogleCalendarConnection | null,
  notionConnection: NotionConnection | null,
  notificationPreferences: SleepNotificationPreferences,
  botIdentity: DiscordBotIdentity | null,
  searchParams: URLSearchParams
): string {
  const requestedTab = searchParams.get("tab");
  const canManageUsers = currentUser.role === "admin";
  const activeTab =
    requestedTab === "apple" ||
    requestedTab === "telegram" ||
    requestedTab === "google" ||
    requestedTab === "notion" ||
    (canManageUsers && requestedTab === "users")
      ? requestedTab
      : "discord";
  let flashMessage: string | null = null;
  let flashTone: "success" | "error" | null = null;

  if (searchParams.get("passwordChanged") === "1") {
    flashMessage = "Password atualizada com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("generated") === "1") {
    flashMessage = "Novo código gerado com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("unlinked") === "1") {
    flashMessage = "A conversa foi removida. Já podes ligar outro chat com o novo código.";
    flashTone = "success";
  } else if (searchParams.get("appleTested") === "1") {
    flashMessage = "Ligacao Apple testada com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("appleSaved") === "1") {
    flashMessage = "Configuracao Apple guardada com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("appleDisabled") === "1") {
    flashMessage = "Sincronizacao Apple desligada.";
    flashTone = "success";
  } else if (searchParams.get("appleSynced") === "1") {
    flashMessage = "Sincronizacao Apple executada.";
    flashTone = "success";
  } else if (searchParams.get("appleError") === "1") {
    flashMessage = appleConnection?.lastError ?? "Ocorreu um erro na integracao Apple.";
    flashTone = "error";
  } else if (searchParams.get("googleLinked") === "1") {
    flashMessage = "Google Calendar ligado com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("googleDisabled") === "1") {
    flashMessage = "Sincronizacao Google desligada.";
    flashTone = "success";
  } else if (searchParams.get("googleSynced") === "1") {
    flashMessage = "Sincronizacao Google executada.";
    flashTone = "success";
  } else if (searchParams.get("googleError") === "1") {
    flashMessage = googleConnection?.lastError ?? "Ocorreu um erro na integracao Google.";
    flashTone = "error";
  } else if (searchParams.get("notionLinked") === "1") {
    flashMessage = "Notion ligado com sucesso.";
    flashTone = "success";
  } else if (searchParams.get("notionDisabled") === "1") {
    flashMessage = "Sincronizacao Notion desligada.";
    flashTone = "success";
  } else if (searchParams.get("notionSynced") === "1") {
    flashMessage = "Sincronizacao Notion executada.";
    flashTone = "success";
  } else if (searchParams.get("notionError") === "1") {
    flashMessage = notionConnection?.lastError ?? "Ocorreu um erro na integracao Notion.";
    flashTone = "error";
  } else if (searchParams.get("usersMessage")) {
    flashMessage = searchParams.get("usersMessage");
    flashTone = "success";
  } else if (searchParams.get("usersError")) {
    flashMessage = searchParams.get("usersError");
    flashTone = "error";
  }

  return renderFrontendPage({
    title: "Dashboard",
    page: "dashboard",
    payload: {
      currentUser,
      users,
      settings,
      chatLinks,
      activeLinkCode,
      appleConnection,
      googleConnection,
      notionConnection,
      notificationPreferences,
      botIdentity,
      activeTab,
      flashMessage,
      flashTone,
      timezone: env.timezone
    }
  });
}

function renderLoginVuePage(errorCode: "invalid_credentials" | "inactive" | null): string {
  return renderFrontendPage({
    title: "Login",
    page: "login",
    payload: {
      errorCode
    }
  });
}

function renderChangePasswordVuePage(user: AppUser, errorMessage: string | null): string {
  return renderFrontendPage({
    title: "Trocar Password",
    page: "change-password",
    payload: {
      user,
      errorMessage
    }
  });
}

function renderCreatedUserVuePage(input: {
  admin: AppUser;
  createdUser?: AppUser;
  temporaryPassword?: string;
  error?: string;
}): string {
  return renderFrontendPage({
    title: input.error ? "Erro a criar conta" : "Conta criada",
    page: "created-user",
    payload: input
  });
}

function renderNotFoundVuePage(): string {
  return renderFrontendPage({
    title: "Página não encontrada",
    page: "not-found",
    payload: {}
  });
}

function renderErrorVuePage(message = "Ocorreu um erro ao processar o pedido."): string {
  return renderFrontendPage({
    title: "Erro",
    page: "error",
    payload: {
      message
    }
  });
}

function renderDashboardPage(
  currentUser: AppUser,
  users: AppUser[],
  settings: RuntimeSettings | null,
  activeLinkCode: { code: string; expiresAt: string } | null,
  appleConnection: AppleCalendarConnection | null,
  googleConnection: GoogleCalendarConnection | null,
  notionConnection: NotionConnection | null,
  botIdentity: DiscordBotIdentity | null,
  searchParams: URLSearchParams
): string {
  const requestedTab = searchParams.get("tab");
  const canManageUsers = currentUser.role === "admin";
  const activeTab =
    requestedTab === "apple" ||
    requestedTab === "telegram" ||
    requestedTab === "google" ||
    requestedTab === "notion" ||
    (canManageUsers && requestedTab === "users")
      ? requestedTab
      : "discord";
  const generated = searchParams.get("generated") === "1";
  const unlinked = searchParams.get("unlinked") === "1";
  const hasLinkedState = Boolean(settings?.enabled && settings?.conversationChannelId && settings?.linkedUserId);
  const botLabel = botIdentity?.globalName?.trim()
    ? `${botIdentity.globalName} (${botIdentity.username})`
    : botIdentity?.username ?? "Bot do Discord";
  const installUrl = botIdentity?.id
    ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
        botIdentity.id
      )}&scope=bot%20applications.commands&permissions=0`
    : null;
  const botAvatar = botIdentity?.avatarUrl
    ? `<img class="bot-avatar" src="${escapeHtml(botIdentity.avatarUrl)}" alt="Avatar do bot" />`
    : "";
  const linkedUserLabel = settings?.linkedUsername?.trim() || settings?.linkedUserId || "Desconhecido";
  const codeExpiresLabel = activeLinkCode
    ? new Date(activeLinkCode.expiresAt).toLocaleString("pt-PT", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: env.timezone
      })
    : null;
  const codeAutoRefreshScript =
    !hasLinkedState && activeLinkCode
      ? `
        <script>
          (() => {
            const expiresAt = new Date(${JSON.stringify(activeLinkCode.expiresAt)}).getTime();
            const delay = Math.max(1000, expiresAt - Date.now() + 1000);
            window.setTimeout(() => window.location.reload(), delay);

            const countdownEl = document.querySelector("[data-code-countdown]");
            const copyButton = document.querySelector("[data-copy-link-code]");
            const copyFeedback = document.querySelector("[data-copy-feedback]");
            const commandToCopy = ${JSON.stringify(`!code ${activeLinkCode.code}`)};

            const updateCountdown = () => {
              if (!countdownEl) {
                return;
              }

              const remainingMs = Math.max(0, expiresAt - Date.now());
              const totalSeconds = Math.floor(remainingMs / 1000);
              const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
              const seconds = String(totalSeconds % 60).padStart(2, "0");
              countdownEl.textContent = minutes + ":" + seconds;
            };

            updateCountdown();
            window.setInterval(updateCountdown, 1000);

            if (copyButton) {
              copyButton.addEventListener("click", async () => {
                try {
                  await navigator.clipboard.writeText(commandToCopy);
                  if (copyFeedback) {
                    copyFeedback.textContent = "Comando copiado.";
                  }
                } catch {
                  if (copyFeedback) {
                    copyFeedback.textContent = "Não consegui copiar automaticamente.";
                  }
                }
              });
            }
          })();
        </script>
      `
      : "";
  const flashMessage =
    searchParams.get("passwordChanged") === "1"
      ? "Password atualizada com sucesso."
      : 
    generated
      ? "Novo código gerado com sucesso."
      : unlinked
        ? "A conversa foi removida. Já podes ligar outro chat com o novo código."
        : searchParams.get("appleTested") === "1"
          ? "Ligação Apple testada com sucesso."
          : searchParams.get("appleSaved") === "1"
            ? "Configuração Apple guardada com sucesso."
            : searchParams.get("appleDisabled") === "1"
              ? "Sincronização Apple desligada."
              : searchParams.get("appleSynced") === "1"
                ? "Sincronização Apple executada."
                : searchParams.get("appleError") === "1"
                  ? appleConnection?.lastError ?? "Ocorreu um erro na integração Apple."
                  : searchParams.get("googleLinked") === "1"
                    ? "Google Calendar ligado com sucesso."
                    : searchParams.get("googleDisabled") === "1"
                      ? "Sincronização Google desligada."
                      : searchParams.get("googleSynced") === "1"
                        ? "Sincronização Google executada."
                        : searchParams.get("googleError") === "1"
                          ? googleConnection?.lastError ?? "Ocorreu um erro na integração Google."
                          : searchParams.get("notionLinked") === "1"
                            ? "Notion ligado com sucesso."
                            : searchParams.get("notionDisabled") === "1"
                              ? "Sincronização Notion desligada."
                              : searchParams.get("notionSynced") === "1"
                                ? "Sincronização Notion executada."
                                : searchParams.get("notionError") === "1"
                                  ? notionConnection?.lastError ?? "Ocorreu um erro na integração Notion."
                  : null;
  const transientParams = [
    "generated",
    "unlinked",
    "appleTested",
    "appleSaved",
    "appleDisabled",
    "appleSynced",
    "appleError",
    "googleLinked",
    "googleDisabled",
    "googleSynced",
    "googleError",
    "notionLinked",
    "notionDisabled",
    "notionSynced",
    "notionError",
    "passwordChanged"
  ].filter((key) => searchParams.has(key));
  const flashModal = flashMessage
    ? `
      <div class="modal-backdrop" data-flash-modal>
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="flash-modal-title">
          <h2 id="flash-modal-title">Atualização concluída</h2>
          <p>${escapeHtml(flashMessage)}</p>
          <div class="actions">
            <button class="button" type="button" data-close-flash-modal>Fechar</button>
          </div>
        </div>
      </div>
      <script>
        (() => {
          const modal = document.querySelector("[data-flash-modal]");
          const closeButton = document.querySelector("[data-close-flash-modal]");
          const closeModal = () => {
            if (modal) {
              modal.remove();
            }
          };

          if (closeButton) {
            closeButton.addEventListener("click", closeModal);
          }

          window.setTimeout(closeModal, 3500);
        })();
      </script>
    `
      : "";
  const transientUrlCleanupScript =
    transientParams.length > 0
      ? `
        <script>
          (() => {
            const url = new URL(window.location.href);
            ${transientParams
              .map((key) => `url.searchParams.delete(${JSON.stringify(key)});`)
              .join("\n            ")}
            const nextUrl = url.pathname + (url.search ? url.search : "") + url.hash;
            window.history.replaceState({}, "", nextUrl);
          })();
        </script>
      `
      : "";

  return renderPage(
    "Dashboard",
    `
      <section class="card page-header">
        <div class="page-header-row">
          <div>
            <h1>Dashboard</h1>
            <p class="page-subtitle">Área de controlo do bot, da conversa ativa e das integrações externas.</p>
          </div>
          <div class="page-actions">
            <div class="account-pill">
              <strong>${escapeHtml(currentUser.displayName ?? currentUser.email)}</strong>
              <span>${escapeHtml(currentUser.role === "admin" ? "Administrador" : "Utilizador")}</span>
            </div>
            <a class="button secondary" href="/change-password">Trocar password</a>
            <form method="post" action="/logout">
              <button class="button ghost" type="submit">Logout</button>
            </form>
          </div>
        </div>
        <div class="page-header-row">
          <nav class="nav-tabs" aria-label="Áreas da dashboard">
            <a class="nav-pill ${activeTab === "discord" ? "active" : ""}" href="/dashboard?tab=discord">Discord</a>
            <a class="nav-pill ${activeTab === "apple" ? "active" : ""}" href="/dashboard?tab=apple">Apple Calendar</a>
            <a class="nav-pill ${activeTab === "google" ? "active" : ""}" href="/dashboard?tab=google">Google Calendar</a>
            <a class="nav-pill ${activeTab === "notion" ? "active" : ""}" href="/dashboard?tab=notion">Notion</a>
            ${
              canManageUsers
                ? `<a class="nav-pill ${activeTab === "users" ? "active" : ""}" href="/dashboard?tab=users">Utilizadores</a>` 
                : ""
            }
          </nav>
          <a class="link" href="/">Home</a>
        </div>
      </section>

      ${
        activeTab === "users"
          ? renderUsersTabBody(users)
          : activeTab === "apple"
          ? renderAppleTabBody(appleConnection)
          : activeTab === "google"
            ? renderGoogleTabBody(googleConnection)
            : activeTab === "notion"
              ? renderNotionTabBody(notionConnection)
              : renderDiscordTabBody({
              currentUser,
              users,
              settings,
              activeLinkCode,
              botIdentity,
              botAvatar,
              botLabel,
              installUrl,
              linkedUserLabel,
              codeExpiresLabel,
              hasLinkedState
            })
      }
      ${flashModal}
      ${transientUrlCleanupScript}
      ${codeAutoRefreshScript}
    `
  );
}

function renderDiscordTabBody(input: {
  currentUser: AppUser;
  users: AppUser[];
  settings: RuntimeSettings | null;
  activeLinkCode: { code: string; expiresAt: string } | null;
  botIdentity: DiscordBotIdentity | null;
  botAvatar: string;
  botLabel: string;
  installUrl: string | null;
  linkedUserLabel: string;
  codeExpiresLabel: string | null;
  hasLinkedState: boolean;
}): string {
  return `
    <section class="cards-grid">
      <section class="card state-card">
        <div class="card-title-row">
          <h2>Estado do bot</h2>
          <span class="tiny-pill">${input.hasLinkedState ? "Conversa ativa" : "À espera de ligação"}</span>
        </div>
        ${
          input.hasLinkedState
            ? `
              <div class="state-panel connected">
                <span class="state-chip">Ligado</span>
                <strong>Pronto para conversar</strong>
                <span>Esta DM já está associada ao bot.</span>
              </div>
              <div class="state-grid">
                <div class="state-item">
                  <span class="state-label">Utilizador</span>
                  <strong>${escapeHtml(input.linkedUserLabel)}</strong>
                </div>
                <div class="state-item">
                  <span class="state-label">Chat</span>
                  <code>${escapeHtml(input.settings?.conversationChannelId ?? "")}</code>
                </div>
                <div class="state-item wide">
                  <span class="state-label">Ligado em</span>
                  <strong>${escapeHtml(
                    input.settings?.linkedAt
                      ? new Date(input.settings.linkedAt).toLocaleString("pt-PT", {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: env.timezone
                        })
                      : "-"
                  )}</strong>
                </div>
              </div>
              <form method="post" action="/dashboard/unlink">
                <div class="actions">
                  <button class="button danger" type="submit">Remover chat associado</button>
                </div>
              </form>
            `
            : `
              <div class="state-panel waiting">
                <span class="state-chip">À espera</span>
                <strong>Nenhum chat ligado</strong>
                <span>Gera um código e envia-o ao bot por DM.</span>
              </div>
              ${
                input.activeLinkCode
                  ? `
                    <div class="code-box">
                      <span class="code-label">Código atual</span>
                      <code class="big-code">${escapeHtml(input.activeLinkCode.code)}</code>
                      <span class="code-meta">Válido até ${escapeHtml(input.codeExpiresLabel ?? "")}</span>
                      <span class="code-meta">Tempo restante: <strong data-code-countdown>--:--</strong></span>
                      <span class="code-meta">Comando direto: <code>!code ${escapeHtml(input.activeLinkCode.code)}</code></span>
                    </div>
                  `
                  : `<p>Ainda não existe nenhum código ativo.</p>`
              }
              <form method="post" action="/dashboard/generate-code">
                <div class="actions wrap">
                  <button class="button" type="submit">Gerar código</button>
                  <button class="button secondary" type="button" data-copy-link-code>Copiar !code</button>
                </div>
              </form>
              <p class="copy-feedback" data-copy-feedback></p>
            `
        }
      </section>

      <section class="card discord-card">
        <div class="card-title-row">
          <h2>Discord</h2>
          <span class="tiny-pill">Bot</span>
        </div>
        <div class="bot-identity">
          ${input.botAvatar}
          <div>
            <p><strong>Bot atual:</strong> ${escapeHtml(input.botLabel)}</p>
            ${
              input.botIdentity?.id
                ? `<p><strong>ID do bot:</strong> <code>${escapeHtml(input.botIdentity.id)}</code></p>`
                : '<p>Não consegui ler a identidade do bot automaticamente, mas o gateway está a usar o token atual do `.env`.</p>'
            }
          </div>
        </div>
        <p>Para falar com o bot, tens primeiro de o instalar ou de ter um servidor em comum com ele. Depois abres a DM e envias o código da esquerda.</p>
        <div class="actions wrap">
          ${
            input.installUrl
              ? `<a class="button" href="${escapeHtml(input.installUrl)}" target="_blank" rel="noreferrer">Adicionar bot ao Discord</a>`
              : ""
          }
          <a class="button secondary" href="https://discord.com/channels/@me" target="_blank" rel="noreferrer">Abrir Discord</a>
        </div>
      </section>

      <section class="card commands-card">
        <div class="card-title-row">
          <h2>Comandos</h2>
          <span class="tiny-pill">DM</span>
        </div>
        <ul class="compact-list">
          <li><code>!code CODIGO</code> liga a conversa.</li>
          <li><code>!show</code> mostra o pedido pendente.</li>
          <li><code>!cancel</code> cancela o pedido atual.</li>
          <li><code>!delete</code> ou <code>!delete 10</code> limpa mensagens do bot.</li>
        </ul>
      </section>

      <section class="card howto-card">
        <div class="card-title-row">
          <h2>Como ligar o bot agora</h2>
          <span class="tiny-pill">4 passos</span>
        </div>
        <ol class="compact-list ordered">
          <li>Adiciona o bot ao Discord, se ainda não o tiveres.</li>
          <li>Abre a DM do <code>${escapeHtml(input.botLabel)}</code>.</li>
          <li>Copia o código mostrado no estado do bot.</li>
          <li>Envia <code>!code ${escapeHtml(input.activeLinkCode?.code ?? "CODIGO")}</code> na DM.</li>
        </ol>
      </section>
    </section>
  `;
}

function renderUsersTabBody(users: AppUser[]): string {
  return `
    <section class="card">
      <div class="card-title-row">
        <h2>Gestao de utilizadores</h2>
        <span class="tiny-pill">Admin</span>
      </div>
      <p>
        Aqui podes criar contas novas, entregar passwords temporarias e acompanhar quem ainda
        precisa de trocar a password no primeiro login.
      </p>
    </section>
    ${renderAdminUsersSection(users)}
  `;
}
function renderAppleTabBody(appleConnection: AppleCalendarConnection | null): string {
  const connection = appleConnection;
  const connectionStatus = connection?.enabled ? "Ativa" : "Opcional";
  const calendars = Array.isArray(connection?.discoveredCalendars)
    ? connection.discoveredCalendars
    : [];

  return `
    <section class="cards-grid">
      <section class="card state-card">
        <div class="card-title-row">
          <h2>Estado da sincronização</h2>
          <span class="tiny-pill">${escapeHtml(connectionStatus)}</span>
        </div>
        <div class="state-panel ${connection?.enabled ? "connected" : "waiting"}">
          <span class="state-chip">${connection?.enabled ? "Bidirecional" : "Desligada"}</span>
          <strong>${connection?.enabled ? "Apple Calendar ligado" : "Apple Calendar ainda não ligado"}</strong>
          <span>${connection?.defaultCalendarName ?? "Ainda não escolheste nenhum calendário por defeito."}</span>
        </div>
        <div class="state-grid">
          <div class="state-item">
            <span class="state-label">Conta</span>
            <strong style="overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(connection?.accountEmail ?? "Por configurar")}</strong>
          </div>
          <div class="state-item">
            <span class="state-label">Modo</span>
            <strong>${escapeHtml(connection?.syncMode === "bidirectional" ? "Bidirecional" : connection?.syncMode ?? "Bidirecional")}</strong>
          </div>
          <div class="state-item wide">
            <span class="state-label">Última sync</span>
            <strong>${escapeHtml(
              connection?.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString("pt-PT", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: env.timezone
                  })
                : "Ainda não sincronizado"
            )}</strong>
          </div>
        </div>
        ${
          connection?.lastError
            ? `<p class="hint">Último erro: ${escapeHtml(connection.lastError)}</p>`
            : `<p class="hint">A listagem continua local. O Apple entra só para criar, editar, apagar e sincronizar alterações externas.</p>`
        }
      </section>

      <section class="card discord-card">
        <div class="card-title-row">
          <h2>Apple Calendar</h2>
          <span class="tiny-pill">Configuração</span>
        </div>
        <form method="post" action="/dashboard/apple/save">
          <label class="field">
            <span>Apple Account email</span>
            <input class="input" type="email" name="accountEmail" value="${escapeHtml(connection?.accountEmail ?? "")}" placeholder="teu-email@icloud.com" />
          </label>
          <label class="field">
            <span>App-specific password</span>
            <input class="input" type="password" name="appSpecificPassword" value="" placeholder="${connection?.hasStoredSecret ? "Mantida na base de dados" : "xxxx-xxxx-xxxx-xxxx"}" />
          </label>
          <div class="actions wrap">
            <a class="button secondary" href="https://account.apple.com/" target="_blank" rel="noreferrer noopener">Abrir Apple Account</a>
            <a class="button secondary" href="https://support.apple.com/en-mide/102654" target="_blank" rel="noreferrer noopener">Guia oficial Apple</a>
          </div>
          <p class="secondary-text">
            A dashboard não consegue ler esta password automaticamente. A Apple obriga a que sejas tu a gerar e copiar a
            app-specific password em <strong>Sign-In and Security &gt; App-Specific Passwords</strong>.
          </p>
          <p class="secondary-text">
            Ao testar ou guardar, o connector procura primeiro um calendário chamado <strong>Outros</strong> ou
            <strong> Other</strong>. Se não existir, cria automaticamente <strong>Outros</strong> e usa-o como calendário
            por defeito. <strong>Lembretes</strong> nunca é usado como destino automático.
          </p>
          <input type="hidden" name="syncMode" value="bidirectional" />
          <div class="actions wrap">
            <button class="button" type="submit">Guardar</button>
            <button class="button secondary" type="submit" formaction="/dashboard/apple/test">Testar ligação</button>
            <button class="button secondary" type="submit" formaction="/dashboard/apple/sync-now">Sincronizar agora</button>
            <button class="button danger" type="submit" formaction="/dashboard/apple/disable">Desligar</button>
          </div>
        </form>
      </section>

      <section class="card commands-card">
        <div class="card-title-row">
          <h2>Calendários encontrados</h2>
          <span class="tiny-pill">${calendars.length}</span>
        </div>
        ${
          calendars.length > 0
            ? `
              <ul class="compact-list">
                ${calendars
                  .map(
                    (calendar) => `
                      <li>
                        <strong>${escapeHtml(calendar.name)}</strong>
                        ${isReminderCalendarName(calendar.name) ? `<span class="inline-meta"> · excluído do routing automático</span>` : ""}
                        ${
                          connection?.defaultCalendarId === calendar.id
                            ? `<span class="inline-meta"> · por defeito automático</span>`
                            : ""
                        }
                        ${
                          calendar.timezone
                            ? `<span class="inline-meta"> · ${escapeHtml(calendar.timezone)}</span>`
                            : ""
                        }
                        ${
                          calendar.description
                            ? `<div class="secondary-text">${escapeHtml(calendar.description)}</div>`
                            : ""
                        }
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : `<p>Primeiro clica em <strong>Testar ligação</strong> para carregar os calendários disponíveis da conta Apple.</p>`
        }
      </section>

      <section class="card howto-card">
        <div class="card-title-row">
          <h2>Como funciona</h2>
          <span class="tiny-pill">Bidirecional</span>
        </div>
        <ol class="compact-list ordered">
          <li>Abre a tua conta Apple e gera uma app-specific password.</li>
          <li>Clica em <strong>Testar ligação</strong> para descobrir os calendários da conta.</li>
          <li>O connector tenta usar <strong>Outros</strong> ou <strong>Other</strong> como calendário por defeito.</li>
          <li>Se não existir nenhum desses, cria automaticamente <strong>Outros</strong>.</li>
          <li><strong>Criar / editar / apagar</strong> continua a gravar primeiro na base de dados local.</li>
          <li>Cada categoria tenta entrar num calendário Apple com o mesmo nome e, se faltar, o connector cria-o.</li>
          <li><strong>Lembretes</strong> nunca é usado automaticamente.</li>
          <li>O Apple Calendar é atualizado a seguir e também pode trazer alterações externas para a BD local.</li>
          <li><strong>Ver eventos</strong> continua a usar a base local, por isso a resposta no Discord mantém-se rápida.</li>
        </ol>
      </section>
    </section>
  `;
}

function renderGoogleTabBody(googleConnection: GoogleCalendarConnection | null): string {
  const connection = googleConnection;
  const connectionStatus = connection?.enabled ? "Ativa" : "Opcional";
  const calendars = Array.isArray(connection?.discoveredCalendars)
    ? connection.discoveredCalendars
    : [];

  return `
    <section class="cards-grid">
      <section class="card state-card">
        <div class="card-title-row">
          <h2>Estado da sincronização</h2>
          <span class="tiny-pill">${escapeHtml(connectionStatus)}</span>
        </div>
        <div class="state-panel ${connection?.enabled ? "connected" : "waiting"}">
          <span class="state-chip">${connection?.enabled ? "Bidirecional" : "Desligada"}</span>
          <strong>${connection?.enabled ? "Google Calendar ligado" : "Google Calendar ainda não ligado"}</strong>
          <span>${connection?.defaultCalendarName ?? "À espera de ligação OAuth ao Google."}</span>
        </div>
        <div class="state-grid">
          <div class="state-item">
            <span class="state-label">Conta</span>
            <strong style="overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(connection?.accountEmail ?? "Por configurar")}</strong>
          </div>
          <div class="state-item">
            <span class="state-label">Modo</span>
            <strong>${escapeHtml(connection?.syncMode === "bidirectional" ? "Bidirecional" : connection?.syncMode ?? "Bidirecional")}</strong>
          </div>
          <div class="state-item wide">
            <span class="state-label">Última sync</span>
            <strong>${escapeHtml(
              connection?.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString("pt-PT", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: env.timezone
                  })
                : "Ainda não sincronizado"
            )}</strong>
          </div>
        </div>
        ${
          connection?.lastError
            ? `<p class="hint">Último erro: ${escapeHtml(connection.lastError)}</p>`
            : `<p class="hint">A listagem continua local. O Google entra só para criar, editar, apagar e sincronizar alterações externas.</p>`
        }
      </section>

      <section class="card discord-card">
        <div class="card-title-row">
          <h2>Google Calendar</h2>
          <span class="tiny-pill">OAuth</span>
        </div>
        <p class="secondary-text">
          O Google é ligado por login seguro. A dashboard abre a autorização e, no fim, guarda a conta,
          os calendários encontrados e o fallback automático.
        </p>
        <p class="secondary-text">
          Ao ligar, o connector procura primeiro um calendário chamado <strong>Outros</strong> ou
          <strong> Other</strong>. Se não existir, cria automaticamente <strong>Outros</strong>.
          Depois cada categoria tenta usar um calendário com o mesmo nome e, se faltar, o connector cria-o.
        </p>
        <div class="actions wrap">
          <a class="button" href="/dashboard/google/connect">Ligar Google Calendar</a>
          <form method="post" action="/dashboard/google/sync-now">
            <button class="button secondary" type="submit">Sincronizar agora</button>
          </form>
          <form method="post" action="/dashboard/google/disable">
            <button class="button danger" type="submit">Desligar</button>
          </form>
        </div>
      </section>

      <section class="card commands-card">
        <div class="card-title-row">
          <h2>Calendários encontrados</h2>
          <span class="tiny-pill">${calendars.length}</span>
        </div>
        ${
          calendars.length > 0
            ? `
              <ul class="compact-list">
                ${calendars
                  .map(
                    (calendar) => `
                      <li>
                        <strong>${escapeHtml(calendar.name)}</strong>
                        ${isReminderCalendarName(calendar.name) ? `<span class="inline-meta"> · excluído do routing automático</span>` : ""}
                        ${connection?.defaultCalendarId === calendar.id ? `<span class="inline-meta"> · fallback automático</span>` : ""}
                        ${calendar.primary ? `<span class="inline-meta"> · principal</span>` : ""}
                        ${calendar.timezone ? `<span class="inline-meta"> · ${escapeHtml(calendar.timezone)}</span>` : ""}
                        ${calendar.description ? `<div class="secondary-text">${escapeHtml(calendar.description)}</div>` : ""}
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            `
            : `<p>Primeiro liga a conta Google para carregar os calendários disponíveis.</p>`
        }
      </section>

      <section class="card howto-card">
        <div class="card-title-row">
          <h2>Como funciona</h2>
          <span class="tiny-pill">Bidirecional</span>
        </div>
        <ol class="compact-list ordered">
          <li>Clica em <strong>Ligar Google Calendar</strong> e autoriza a conta.</li>
          <li>O connector descobre os calendários e garante um fallback <strong>Outros</strong> ou <strong>Other</strong>.</li>
          <li><strong>Criar / editar / apagar</strong> continua a gravar primeiro na base de dados local.</li>
          <li>O Google recebe a alteração a seguir e também pode trazer alterações externas para a BD local.</li>
          <li>Cada categoria tenta usar um calendário Google com o mesmo nome e, se faltar, o connector cria-o.</li>
          <li><strong>Ver eventos</strong> continua a usar a base local, por isso a resposta no Discord mantém-se rápida.</li>
        </ol>
      </section>
    </section>
  `;
}

function renderNotionTabBody(notionConnection: NotionConnection | null): string {
  const connection = notionConnection;
  const connectionStatus = connection?.enabled ? "Ativa" : "Opcional";

  return `
    <section class="cards-grid">
      <section class="card state-card">
        <div class="card-title-row">
          <h2>Estado da sincronização</h2>
          <span class="tiny-pill">${escapeHtml(connectionStatus)}</span>
        </div>
        <div class="state-panel ${connection?.enabled ? "connected" : "waiting"}">
          <span class="state-chip">${connection?.enabled ? "Bidirecional" : "Desligada"}</span>
          <strong>${connection?.enabled ? "Notion ligado" : "Notion ainda não ligado"}</strong>
          <span>${connection?.workspaceName ?? "À espera da ligação OAuth ao Notion."}</span>
        </div>
        <div class="state-grid">
          <div class="state-item">
            <span class="state-label">Workspace</span>
            <strong>${escapeHtml(connection?.workspaceName ?? "Por configurar")}</strong>
          </div>
          <div class="state-item">
            <span class="state-label">Modo</span>
            <strong>${escapeHtml(connection?.syncMode === "bidirectional" ? "Bidirecional" : connection?.syncMode ?? "Bidirecional")}</strong>
          </div>
          <div class="state-item wide">
            <span class="state-label">Última sync</span>
            <strong>${escapeHtml(
              connection?.lastSyncAt
                ? new Date(connection.lastSyncAt).toLocaleString("pt-PT", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: env.timezone
                  })
                : "Ainda não sincronizado"
            )}</strong>
          </div>
        </div>
        ${
          connection?.lastError
            ? `<p class="hint">Último erro: ${escapeHtml(connection.lastError)}</p>`
            : `<p class="hint">A listagem continua local. O Notion entra só para criar, editar, apagar e sincronizar alterações externas.</p>`
        }
      </section>

      <section class="card discord-card">
        <div class="card-title-row">
          <h2>Notion</h2>
          <span class="tiny-pill">OAuth</span>
        </div>
        <p class="secondary-text">
          O Notion fica ligado por login seguro. Depois o connector cria automaticamente uma página
          <strong> Pulse Calendar</strong> e uma base <strong>Pulse Events</strong> para guardarmos tudo sem configuração manual.
        </p>
        <p class="secondary-text">
          Quando houver alterações no Notion, o connector faz sync para a base local e depois pode propagar para Apple e Google.
          Se ligares webhooks no Notion, essa atualização passa a entrar ainda mais depressa.
        </p>
        <div class="actions wrap">
          <a class="button" href="/dashboard/notion/connect">Ligar Notion</a>
          <form method="post" action="/dashboard/notion/sync-now">
            <button class="button secondary" type="submit">Sincronizar agora</button>
          </form>
          <form method="post" action="/dashboard/notion/disable">
            <button class="button danger" type="submit">Desligar</button>
          </form>
        </div>
      </section>

      <section class="card commands-card">
        <div class="card-title-row">
          <h2>Base Notion</h2>
          <span class="tiny-pill">${connection?.enabled ? "Automática" : "Pendente"}</span>
        </div>
        <ul class="compact-list">
          <li><strong>Workspace:</strong> ${escapeHtml(connection?.workspaceName ?? "por configurar")}</li>
          <li><strong>Database ID:</strong> <code>${escapeHtml(connection?.databaseId ?? "-")}</code></li>
          <li>
            <strong>Link:</strong>
            ${
              connection?.databaseUrl
                ? `<a class="link" href="${escapeHtml(connection.databaseUrl)}" target="_blank" rel="noreferrer">Abrir base no Notion</a>`
                : " ainda não criado"
            }
          </li>
        </ul>
      </section>

      <section class="card howto-card">
        <div class="card-title-row">
          <h2>Como funciona</h2>
          <span class="tiny-pill">Webhook ready</span>
        </div>
        <ol class="compact-list ordered">
          <li>Clica em <strong>Ligar Notion</strong> e autoriza a workspace.</li>
          <li>O connector cria a página <strong>Pulse Calendar</strong> e a base <strong>Pulse Events</strong>.</li>
          <li><strong>Criar / editar / apagar</strong> continua a gravar primeiro na base de dados local.</li>
          <li>Depois o Notion é atualizado com título, data, descrição, categoria e Pulse ID.</li>
          <li>Se alterares algo no Notion, a sync traz a mudança para a base local e propaga para os outros connectors.</li>
          <li>Se configurares o webhook do Notion para <code>/webhooks/notion</code>, a reação fica mais rápida do que depender só de sync manual.</li>
        </ol>
      </section>
    </section>
  `;
}

function renderAdminUsersSection(users: AppUser[]): string {
  return `
    <section class="admin-grid">
      <section class="card">
        <div class="card-title-row">
          <h2>Administradores e contas</h2>
          <span class="tiny-pill">${users.length}</span>
        </div>
        <p>Como administrador, podes criar novas contas e entregar uma password temporária. No primeiro login, a pessoa é obrigada a trocá-la.</p>
        <form method="post" action="/dashboard/admin/users/create">
          <div class="two-column-form">
            <label class="field">
              <span>Email</span>
              <input class="input" type="email" name="email" placeholder="utilizador@email.com" required />
            </label>
            <label class="field">
              <span>Nome</span>
              <input class="input" type="text" name="displayName" placeholder="Nome do utilizador" />
            </label>
            <label class="field">
              <span>Role</span>
              <select class="input" name="role">
                <option value="user">Utilizador</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <div class="actions wrap">
            <button class="button" type="submit">Criar conta com password temporária</button>
          </div>
        </form>
      </section>

      <section class="card">
        <div class="card-title-row">
          <h2>Contas existentes</h2>
          <span class="tiny-pill">Admin</span>
        </div>
        <ul class="compact-list">
          ${users
            .map(
              (user) => `
                <li>
                  <strong>${escapeHtml(user.displayName ?? user.email)}</strong>
                  <span class="inline-meta"> · ${escapeHtml(user.email)}</span>
                  <span class="inline-meta"> · ${escapeHtml(user.role)}</span>
                  ${
                    user.mustChangePassword
                      ? `<span class="inline-meta"> · troca obrigatória de password</span>`
                      : ""
                  }
                </li>
              `
            )
            .join("")}
        </ul>
      </section>
    </section>
  `;
}

function renderHomePage(): string {
  const getStartedHref = env.contactEmail ? `mailto:${env.contactEmail}` : "mailto:";
  return renderPage(
    "Movic",
    `
      <section class="hero-card">
        <div class="hero-nav">
          <div class="brand-mark">Movic</div>
          <div class="actions wrap">
            <a class="button secondary" href="${escapeHtml(getStartedHref)}">Get Start</a>
            <a class="button" href="/login">Login</a>
          </div>
        </div>
        <div class="hero-copy">
          <div>
            <span class="eyebrow">Dashboard pública</span>
            <h1>Controla o bot, o chat e as integrações num só sítio.</h1>
            <p>
              Cada utilizador fica com a sua própria conta, a sua conversa Discord ligada e as suas integrações Apple,
              Google e Notion separadas das restantes.
            </p>
          </div>
          <div class="hero-panel">
            <strong>O que já está pronto</strong>
            <ul class="compact-list">
              <li>Dashboard multi-utilizador</li>
              <li>Ligação ao Discord por código</li>
              <li>Apple, Google e Notion por conta</li>
            </ul>
          </div>
        </div>
      </section>
    `
  );
}

function renderLoginPage(errorMessage: string | null): string {
  return renderPage(
    "Login",
    `
      <section class="auth-shell">
        <section class="card auth-card">
          <div class="card-title-row">
            <h1>Login</h1>
            <a class="link" href="/">Home</a>
          </div>
          <p>Entra com a tua conta para veres apenas as tuas definições e integrações.</p>
          ${errorMessage ? `<div class="alert error">${escapeHtml(errorMessage)}</div>` : ""}
          <form method="post" action="/login">
            <label class="field">
              <span>Email</span>
              <input class="input" type="email" name="email" required />
            </label>
            <label class="field">
              <span>Password</span>
              <input class="input" type="password" name="password" required />
            </label>
            <div class="actions wrap">
              <button class="button" type="submit">Entrar</button>
              <a class="button secondary" href="/">Voltar</a>
            </div>
          </form>
        </section>
      </section>
    `
  );
}

function renderChangePasswordPage(user: AppUser, errorMessage: string | null): string {
  return renderPage(
    "Trocar Password",
    `
      <section class="auth-shell">
        <section class="card auth-card">
          <div class="card-title-row">
            <h1>Trocar password</h1>
            <span class="tiny-pill">${escapeHtml(user.email)}</span>
          </div>
          <p>Esta conta ainda está com password temporária. Antes de entrares na dashboard, tens de a trocar.</p>
          ${errorMessage ? `<div class="alert error">${escapeHtml(errorMessage)}</div>` : ""}
          <form method="post" action="/change-password">
            <label class="field">
              <span>Password atual</span>
              <input class="input" type="password" name="currentPassword" required />
            </label>
            <label class="field">
              <span>Nova password</span>
              <input class="input" type="password" name="nextPassword" required />
            </label>
            <label class="field">
              <span>Confirmar nova password</span>
              <input class="input" type="password" name="confirmPassword" required />
            </label>
            <div class="actions wrap">
              <button class="button" type="submit">Guardar password</button>
            </div>
          </form>
        </section>
      </section>
    `
  );
}

function renderCreatedUserPage(input: {
  admin: AppUser;
  createdUser?: AppUser;
  temporaryPassword?: string;
  error?: string;
}): string {
  return renderPage(
    input.error ? "Erro a criar conta" : "Conta criada",
    `
      <section class="auth-shell">
        <section class="card auth-card">
          <div class="card-title-row">
            <h1>${input.error ? "Não consegui criar a conta" : "Conta criada com sucesso"}</h1>
            <a class="link" href="/dashboard">Voltar à dashboard</a>
          </div>
          ${
            input.error
              ? `<div class="alert error">${escapeHtml(input.error)}</div>`
              : `
                <p>Entrega estes dados à pessoa. No primeiro login ela vai ser obrigada a trocar a password.</p>
                <div class="state-grid">
                  <div class="state-item wide">
                    <span class="state-label">Email</span>
                    <strong>${escapeHtml(input.createdUser?.email ?? "")}</strong>
                  </div>
                  <div class="state-item wide">
                    <span class="state-label">Password temporária</span>
                    <code>${escapeHtml(input.temporaryPassword ?? "")}</code>
                  </div>
                </div>
              `
          }
        </section>
      </section>
    `
  );
}

function renderNotFoundPage(): string {
  return renderPage(
    "Página não encontrada",
    `
      <section class="card">
        <h1>Página não encontrada</h1>
        <p>O caminho pedido não existe nesta dashboard.</p>
        <a class="link" href="/dashboard">Voltar à dashboard</a>
      </section>
    `
  );
}

function renderErrorPage(message = "Ocorreu um erro ao processar o pedido."): string {
  return renderPage(
    "Erro",
    `
      <section class="card">
        <h1>Algo correu mal</h1>
        <p>${escapeHtml(message)}</p>
        <a class="link" href="/dashboard">Voltar à dashboard</a>
      </section>
    `
  );
}

function renderPage(title: string, content: string): string {
  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: linear-gradient(160deg, #f0eadc 0%, #d6e6ea 45%, #f8f1e7 100%);
        --card: rgba(255, 251, 245, 0.92);
        --ink: #1e2732;
        --muted: #5e6a75;
        --accent: #0e7c86;
        --accent-strong: #0b5961;
        --border: rgba(30, 39, 50, 0.12);
        --ok-bg: rgba(39, 113, 73, 0.12);
        --ok-ink: #1f6b45;
        --idle-bg: rgba(14, 124, 134, 0.12);
        --idle-ink: #0b5961;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
        color: var(--ink);
        background: var(--bg);
        min-height: 100vh;
        overflow-x: hidden;
        overflow-y: auto;
      }

      main {
        max-width: 1180px;
        margin: 0 auto;
        min-height: 100vh;
        padding: 18px 18px 24px;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 22px;
        box-shadow: 0 18px 45px rgba(30, 39, 50, 0.08);
        margin-bottom: 0;
        backdrop-filter: blur(16px);
      }

      .page-header h1,
      .card h1,
      .card h2 {
        margin: 0 0 10px;
        font-family: Georgia, "Times New Roman", serif;
      }

      .card p {
        margin: 0 0 10px;
        color: var(--muted);
        line-height: 1.45;
        font-size: 0.98rem;
      }

      .card ol,
      .card ul {
        margin: 0 0 10px 20px;
        padding: 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .card li {
        margin-bottom: 4px;
      }

      .page-header {
        display: grid;
        gap: 12px;
        margin-bottom: 14px;
      }

      .page-header-row {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 16px;
      }

      .page-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        flex-wrap: wrap;
      }

      .account-pill {
        display: grid;
        gap: 2px;
        padding: 10px 14px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.55);
      }

      .account-pill span {
        color: var(--muted);
        font-size: 0.85rem;
      }

      .page-subtitle {
        margin: 0;
        font-size: 0.98rem;
      }

      .nav-tabs {
        display: flex;
        gap: 12px;
      }

      .nav-tabs a {
        text-decoration: none;
      }

      .hero-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 28px;
        padding: 28px;
        box-shadow: 0 18px 45px rgba(30, 39, 50, 0.08);
      }

      .hero-nav,
      .hero-copy {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: flex-start;
        flex-wrap: wrap;
      }

      .hero-copy {
        margin-top: 34px;
      }

      .hero-panel {
        min-width: 260px;
        max-width: 320px;
        background: rgba(255,255,255,0.55);
        border: 1px solid var(--border);
        border-radius: 22px;
        padding: 18px;
      }

      .brand-mark,
      .eyebrow {
        display: inline-flex;
        font-weight: 800;
        color: var(--accent-strong);
      }

      .auth-shell {
        min-height: calc(100vh - 36px);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .auth-card {
        width: min(100%, 520px);
      }

      .nav-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 10px 16px;
        font-weight: 700;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.45);
        border: 1px solid var(--border);
      }

      .nav-pill.active {
        color: #fff;
        background: var(--accent);
        border-color: transparent;
      }

      .cards-grid {
        display: grid;
        grid-template-columns: 0.9fr 1.1fr;
        grid-template-areas:
          "state discord"
          "commands howto";
        gap: 18px;
        align-items: stretch;
      }

      .admin-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 18px;
      }

      .two-column-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .bot-identity {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 16px;
        align-items: center;
      }

      .state-card { grid-area: state; }
      .discord-card { grid-area: discord; }
      .commands-card { grid-area: commands; }
      .howto-card { grid-area: howto; }

      .card-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      .tiny-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 7px 12px;
        font-size: 0.82rem;
        font-weight: 700;
        color: var(--accent-strong);
        background: rgba(14, 124, 134, 0.1);
      }

      .bot-avatar {
        width: 62px;
        height: 62px;
        border-radius: 18px;
        object-fit: cover;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.8);
      }

      .state-panel {
        display: grid;
        gap: 6px;
        border-radius: 20px;
        padding: 18px;
        margin-bottom: 16px;
        border: 1px solid transparent;
      }

      .state-panel.connected {
        background: linear-gradient(160deg, rgba(41, 130, 86, 0.14), rgba(255,255,255,0.72));
        border-color: rgba(41, 130, 86, 0.18);
      }

      .state-panel.waiting {
        background: linear-gradient(160deg, rgba(14, 124, 134, 0.14), rgba(255,255,255,0.72));
        border-color: rgba(14, 124, 134, 0.18);
      }

      .state-chip {
        display: inline-flex;
        width: fit-content;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 0.82rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        background: rgba(255,255,255,0.85);
        color: var(--accent-strong);
      }

      .state-panel strong {
        font-size: 1.2rem;
        color: var(--ink);
      }

      .state-panel span:last-child {
        color: var(--muted);
      }

      .state-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .state-item {
        display: grid;
        gap: 6px;
        padding: 14px;
        border-radius: 16px;
        background: rgba(255,255,255,0.55);
        border: 1px solid var(--border);
        min-width: 0;
      }

      .state-item.wide {
        grid-column: 1 / -1;
      }

      .state-item strong,
      .state-item code {
        min-width: 0;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .state-label {
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .code-box {
        display: grid;
        gap: 8px;
        margin: 14px 0;
        padding: 16px;
        border-radius: 18px;
        background: rgba(14, 124, 134, 0.08);
        border: 1px solid rgba(14, 124, 134, 0.14);
      }

      .code-label,
      .code-meta {
        color: var(--muted);
        font-size: 0.95rem;
      }

      .big-code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 1.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        color: var(--accent-strong);
      }

      .status,
      .notice {
        border-radius: 16px;
        padding: 14px 16px;
        font-weight: 600;
        margin-top: 14px;
      }

      .status.ok {
        background: var(--ok-bg);
        color: var(--ok-ink);
      }

      .status.idle,
      .notice {
        background: var(--idle-bg);
        color: var(--idle-ink);
      }

      .hint {
        font-weight: 600;
        color: var(--accent-strong);
      }

      .button,
      button.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: #fff;
        padding: 12px 18px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
      }

      .button:hover,
      button.button:hover {
        background: var(--accent-strong);
      }

      .button.danger {
        background: #a33d3d;
      }

      .button.danger:hover {
        background: #842f2f;
      }

      .button.secondary {
        background: rgba(14, 124, 134, 0.12);
        color: var(--accent-strong);
        border: 1px solid rgba(14, 124, 134, 0.16);
      }

      .button.secondary:hover {
        background: rgba(14, 124, 134, 0.2);
      }

      .button.ghost {
        background: transparent;
        color: var(--accent-strong);
        border: 1px solid var(--border);
      }

      .button.ghost:hover {
        background: rgba(255,255,255,0.5);
      }

      .link {
        color: var(--accent-strong);
        text-decoration: none;
        font-weight: 600;
      }

      form {
        display: grid;
        gap: 16px;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .actions.wrap {
        flex-wrap: wrap;
      }

      .copy-feedback {
        min-height: 1.2rem;
        font-weight: 600;
        color: var(--accent-strong);
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field > span {
        font-weight: 700;
        color: var(--muted);
      }

      .input {
        width: 100%;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.72);
        color: var(--ink);
        border-radius: 16px;
        padding: 12px 14px;
        font: inherit;
      }

      .toggle-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        color: var(--ink);
      }

      .inline-meta,
      .secondary-text {
        color: var(--muted);
      }

      .secondary-text {
        font-size: 0.92rem;
        margin-top: 2px;
      }

      .compact-list li {
        margin-bottom: 10px;
      }

      .ordered {
        margin-left: 18px;
      }

      .modal-backdrop {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(30, 39, 50, 0.28);
        backdrop-filter: blur(6px);
        z-index: 50;
      }

      .modal-card {
        width: min(440px, 100%);
        background: rgba(255, 251, 245, 0.98);
        border: 1px solid var(--border);
        border-radius: 24px;
        padding: 26px;
        box-shadow: 0 24px 60px rgba(30, 39, 50, 0.16);
      }

      .modal-card h2 {
        margin-bottom: 12px;
      }

      .alert {
        margin: 12px 0 18px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid rgba(163, 61, 61, 0.18);
        background: rgba(163, 61, 61, 0.08);
        color: #8a2f2f;
        font-weight: 600;
      }

      code {
        font-family: "Cascadia Code", "Consolas", monospace;
        font-size: 0.95em;
      }

      @media (max-width: 820px) {
        body {
          overflow: auto;
        }

        main {
          min-height: auto;
          padding: 16px;
        }

        .page-header-row {
          display: grid;
          align-items: start;
        }

        .cards-grid {
          grid-template-columns: 1fr;
          grid-template-areas:
            "state"
            "discord"
            "commands"
            "howto";
        }

        .admin-grid,
        .two-column-form {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>${content}</main>
  </body>
</html>`;
}

function generateLinkCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let value = "";

  for (let index = 0; index < 8; index += 1) {
    value += alphabet[bytes[index] % alphabet.length];
  }

  return `${value.slice(0, 4)}-${value.slice(4)}`;
}

function normalizeLinkCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isAuthorizedInternalRequest(request: IncomingMessage): boolean {
  const providedToken = request.headers["x-internal-api-token"];
  return providedToken === env.internalApiToken;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isReminderCalendarName(name: string | null | undefined): boolean {
  const normalized = normalizeLooseText(name);
  return normalized === "lembretes" || normalized === "reminders" || normalized === "reminder";
}

function normalizeLooseText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickDefaultAppleCalendarId(
  calendars: AppleCalendarOption[],
  currentId: string | null | undefined
): string | null {
  if (currentId) {
    const current = calendars.find(
      (calendar) => calendar.id === currentId && !isReminderCalendarName(calendar.name)
    );
    if (current) {
      return current.id;
    }
  }

  return calendars.find((calendar) => !isReminderCalendarName(calendar.name))?.id ?? null;
}

function pickDefaultAppleCalendarName(
  calendars: AppleCalendarOption[],
  currentId: string | null | undefined,
  currentName: string | null | undefined
): string | null {
  if (currentId) {
    const current = calendars.find(
      (calendar) => calendar.id === currentId && !isReminderCalendarName(calendar.name)
    );
    if (current) {
      return current.name;
    }
  }

  if (currentName && !isReminderCalendarName(currentName)) {
    const current = calendars.find(
      (calendar) => normalizeLooseText(calendar.name) === normalizeLooseText(currentName)
    );
    if (current) {
      return current.name;
    }
  }

  return calendars.find((calendar) => !isReminderCalendarName(calendar.name))?.name ?? null;
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
    throw new Error("O segredo Apple guardado está inválido.");
  }

  const key = createHash("sha256").update(secret).digest();
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

function validateEnv(): void {
  const missing: string[] = [];

  if (!env.internalApiToken) {
    missing.push("DASHBOARD_INTERNAL_API_TOKEN");
  }

  if (!env.postgresUrl) {
    missing.push("CONFIG_POSTGRES_URL");
  }

  if (!env.defaultAdminEmail) {
    missing.push("DEFAULT_ADMIN_EMAIL");
  }

  if (!env.defaultAdminPassword) {
    missing.push("DEFAULT_ADMIN_PASSWORD");
  }

  if (missing.length > 0) {
    throw new Error(
      `Faltam variáveis de ambiente obrigatórias: ${missing.join(", ")}`
    );
  }
}




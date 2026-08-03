import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
};

type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  from?: TelegramUser;
  chat: TelegramChat;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type OrchestratorResponse = {
  reply?: string;
};

type InternalSendMessageRequest = {
  channelId?: string;
  message?: string;
};

type PendingCommandState = {
  command: string;
  extractedData: Record<string, unknown>;
  missingFields: string[];
  lastUserMessage: string;
  followUpQuestion: string;
  updatedAt: string;
};

type RuntimeBotConfig = {
  dashboardUserId?: string;
  platform?: string;
  channelId: string;
  userId: string;
  username?: string | null;
  linkedAt?: string | null;
  alreadyLinked?: boolean;
  setupPrompt?: string;
};

type NotificationPreferenceChatResponse = {
  success?: boolean;
  handled?: boolean;
  reply?: string;
};

const env = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? "http://orchestrator:8000",
  dashboardServiceUrl: process.env.DASHBOARD_SERVICE_URL ?? "http://dashboard-service:8088",
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL ?? "http://localhost:8088",
  dashboardInternalApiToken: process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "",
  pollTimeoutSeconds: Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS ?? "30"),
  internalPort: Number(process.env.TELEGRAM_GATEWAY_INTERNAL_PORT ?? "8011")
};

const TELEGRAM_MESSAGE_LIMIT = 3900;
const PLATFORM = "telegram";
const PROCESSING_REACTIONS = ["⏳", "👀", "🤔"];
const SUCCESS_REACTIONS = ["✅", "👍", "👌"];
const ERROR_REACTIONS = ["❌", "👎", "😢"];

let nextUpdateOffset = 0;
let stopping = false;

validateEnv();

void main();

async function main(): Promise<void> {
  const me = await callTelegramApi<TelegramUser>("getMe");
  console.log(`[telegram-gateway] Ligado ao Telegram como @${me.username ?? me.id}.`);
  startInternalServer();

  while (!stopping) {
    try {
      const updates = await callTelegramApi<TelegramUpdate[]>("getUpdates", {
        offset: nextUpdateOffset || undefined,
        timeout: env.pollTimeoutSeconds,
        allowed_updates: ["message"]
      });

      for (const update of updates) {
        nextUpdateOffset = Math.max(nextUpdateOffset, update.update_id + 1);
        await handleUpdate(update);
      }
    } catch (error) {
      console.error(
        `[telegram-gateway] Falha no polling: ${error instanceof Error ? error.message : String(error)}`
      );
      await sleep(3000);
    }
  }
}

function startInternalServer(): void {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", `http://localhost:${env.internalPort}`);
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        return writeJson(response, 200, { status: "ok", service: "telegram-gateway" });
      }

      if (request.method === "POST" && requestUrl.pathname === "/internal/send-message") {
        if (!isAuthorizedInternalRequest(request)) {
          return writeJson(response, 401, { success: false, error: "Nao autorizado." });
        }

        const payload = safeJsonParse(await readBody(request)) as InternalSendMessageRequest | null;
        const message = payload?.message?.trim();
        const chatId = parseTelegramChatId(payload?.channelId ?? "");

        if (!chatId || !message) {
          return writeJson(response, 400, { success: false, error: "Pedido incompleto." });
        }

        await sendTelegramMessage(chatId, message);
        return writeJson(response, 200, { success: true });
      }

      return writeJson(response, 404, { success: false, error: "Nao encontrado." });
    } catch (error) {
      console.error("[telegram-gateway] Erro no endpoint interno:", error);
      return writeJson(response, 500, { success: false, error: "Erro interno." });
    }
  });

  server.listen(env.internalPort, () => {
    console.log(`[telegram-gateway] Endpoint interno na porta ${env.internalPort}.`);
  });
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message) {
    return;
  }

  if (message.chat.type !== "private") {
    if (message.text?.trim()) {
      await sendTelegramMessage(
        message.chat.id,
        "A Movic só funciona em conversa privada. Abre @TheMovicBot e envia a mensagem por DM."
      );
    }
    return;
  }

  if (!shouldProcessMessage(message)) {
    return;
  }

  const text = message.text?.trim() ?? "";
  if (!text) {
    await sendTelegramMessage(message.chat.id, "Para já só consigo processar mensagens de texto nesta conversa.");
    return;
  }

  if (isLinkCodeCommand(text)) {
    await handleLinkCodeCommand(message, text);
    return;
  }

  const runtimeConfig = await resolveRuntimeConfigForMessage(getChannelId(message), getUserId(message));
  if (!runtimeConfig) {
    await sendTelegramMessage(
      message.chat.id,
      [
        "Esta conversa ainda não está ligada ao bot nesta dashboard.",
        `Abre ${env.dashboardBaseUrl} para ver o código atual e envia aqui \`!code CODIGO\`.`,
        "Depois disso este chat fica associado automaticamente."
      ].join("\n")
    );
    return;
  }

  if (text.startsWith("!")) {
    await handleCommandMessage(message, text);
    return;
  }

  const preferenceResult = await handleNotificationPreferenceMessage(message, text, runtimeConfig);
  if (preferenceResult.handled) {
    if (preferenceResult.reply) {
      await sendTelegramMessage(message.chat.id, preferenceResult.reply);
    }
    await setTelegramMessageReaction(message.chat.id, message.message_id, SUCCESS_REACTIONS).catch(() => undefined);
    return;
  }

  try {
    await setTelegramMessageReaction(message.chat.id, message.message_id, PROCESSING_REACTIONS);
    const outcome = await buildReply(message, text, runtimeConfig);
    await sendTelegramMessage(message.chat.id, outcome.reply);
    await setTelegramMessageReaction(message.chat.id, message.message_id, SUCCESS_REACTIONS);
  } catch (error) {
    await setTelegramMessageReaction(message.chat.id, message.message_id, ERROR_REACTIONS).catch(() => undefined);
    console.error("[telegram-gateway] Erro ao tratar mensagem:", error);
    await sendTelegramMessage(
      message.chat.id,
      "Ocorreu um erro a processar a tua mensagem. Tenta novamente dentro de instantes."
    );
  }
}

function shouldProcessMessage(message: TelegramMessage): boolean {
  return message.chat.type === "private" && message.from?.is_bot !== true && Boolean(message.from?.id);
}

async function handleLinkCodeCommand(message: TelegramMessage, text: string): Promise<void> {
  const code = extractLinkCode(text);
  if (!code) {
    await sendTelegramMessage(
      message.chat.id,
      "Formato esperado: `!code ABCD-1234`. Abre a dashboard para ver o código atual."
    );
    return;
  }

  try {
    const result = await claimLinkCode({
      code,
      channelId: getChannelId(message),
      userId: getUserId(message),
      username: getUsername(message)
    });

    await sendTelegramMessage(
      message.chat.id,
      result.alreadyLinked
        ? [
            "Este chat já estava ligado.",
            "Podes continuar a falar comigo normalmente, por exemplo: `Marca reunião amanhã às 11` ou `O que tenho hoje?`",
            result.setupPrompt ?? ""
          ].filter(Boolean).join("\n")
        : [
            "Ligação concluída com sucesso.",
            "Este chat ficou associado à tua conta da dashboard e já posso agir sobre a tua agenda a partir daqui.",
            "Podes escrever diretamente coisas como `Marca reunião amanhã às 11` ou `O que tenho hoje?`",
            result.setupPrompt ?? ""
          ].filter(Boolean).join("\n")
    );
  } catch (error) {
    await sendTelegramMessage(message.chat.id, error instanceof Error ? error.message : String(error));
  }
}

async function handleCommandMessage(message: TelegramMessage, text: string): Promise<void> {
  const [rawCommand = ""] = text.split(/\s+/, 1);
  const command = rawCommand.toLowerCase();
  const channelId = getChannelId(message);

  if (command === "!cancel") {
    const result = await cancelPendingCommand(channelId);
    await sendTelegramMessage(
      message.chat.id,
      result.cleared
        ? "Pedido atual cancelado. Podes começar outro quando quiseres."
        : "Não há nenhum pedido pendente neste momento."
    );
    return;
  }

  if (command === "!show") {
    const pending = await fetchPendingCommand(channelId);
    await sendTelegramMessage(message.chat.id, formatPendingCommandMessage(pending));
    return;
  }

  await sendTelegramMessage(message.chat.id, buildCommandsHelpMessage());
}

async function buildReply(
  message: TelegramMessage,
  text: string,
  runtimeConfig: RuntimeBotConfig
): Promise<{ reply: string }> {
  const response = await fetch(`${env.orchestratorUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      source: "telegram-dm",
      channelId: getChannelId(message),
      userId: runtimeConfig.dashboardUserId ?? getUserId(message),
      username: getUsername(message),
      messageId: String(message.message_id),
      content: text,
      timestamp: new Date(message.date * 1000).toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(`Orchestrator respondeu com ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as OrchestratorResponse;
  if (!body.reply) {
    throw new Error("O orchestrator não devolveu o campo 'reply'.");
  }

  return {
    reply: body.reply
  };
}

async function resolveRuntimeConfigForMessage(
  channelId: string,
  userId: string
): Promise<RuntimeBotConfig | null> {
  try {
    const url = new URL(`${env.dashboardServiceUrl.replace(/\/$/, "")}/api/runtime-config/resolve`);
    url.searchParams.set("platform", PLATFORM);
    url.searchParams.set("channelId", channelId);
    url.searchParams.set("userId", userId);

    const response = await fetch(url, {
      headers: {
        "x-internal-api-token": env.dashboardInternalApiToken
      }
    });

    if (!response.ok) {
      throw new Error(`Dashboard respondeu com ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      configured?: boolean;
      config?: RuntimeBotConfig | null;
    };

    return body.configured && body.config?.channelId && body.config?.userId ? body.config : null;
  } catch (error) {
    console.error(
      `[telegram-gateway] Não foi possível ler a configuração da dashboard: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

async function claimLinkCode(input: {
  code: string;
  channelId: string;
  userId: string;
  username: string;
}): Promise<RuntimeBotConfig> {
  const response = await fetch(`${env.dashboardServiceUrl.replace(/\/$/, "")}/api/link-code/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-api-token": env.dashboardInternalApiToken
    },
    body: JSON.stringify({
      platform: PLATFORM,
      ...input
    })
  });

  const body = (await response.json()) as {
    success?: boolean;
    error?: string;
    alreadyLinked?: boolean;
    setupPrompt?: string;
    config?: RuntimeBotConfig | null;
  };

  if (!response.ok || !body.success || !body.config?.channelId || !body.config?.userId) {
    throw new Error(body.error ?? `Não foi possível ligar o chat (${response.status}).`);
  }

  return {
    ...body.config,
    alreadyLinked: body.alreadyLinked,
    setupPrompt: body.setupPrompt
  };
}

async function handleNotificationPreferenceMessage(
  message: TelegramMessage,
  text: string,
  runtimeConfig: RuntimeBotConfig
): Promise<{ handled: boolean; reply?: string }> {
  try {
    const response = await fetch(
      `${env.dashboardServiceUrl.replace(/\/$/, "")}/api/notification-preferences/chat-message`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-api-token": env.dashboardInternalApiToken
        },
        body: JSON.stringify({
          platform: PLATFORM,
          channelId: getChannelId(message),
          userId: runtimeConfig.userId,
          text
        })
      }
    );

    if (!response.ok) {
      return { handled: false };
    }

    const body = (await response.json()) as NotificationPreferenceChatResponse;
    return {
      handled: body.handled === true,
      reply: body.reply
    };
  } catch (error) {
    console.error("[telegram-gateway] Não foi possível tratar preferências de notificação:", error);
    return { handled: false };
  }
}

async function fetchPendingCommand(channelId: string): Promise<PendingCommandState | null> {
  const response = await fetch(
    `${env.orchestratorUrl.replace(/\/$/, "")}/pending?channelId=${encodeURIComponent(channelId)}`
  );

  if (!response.ok) {
    throw new Error(`Orchestrator respondeu com ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as {
    pending?: PendingCommandState | null;
  };

  return body.pending ?? null;
}

async function cancelPendingCommand(channelId: string): Promise<{ cleared: boolean }> {
  const response = await fetch(
    `${env.orchestratorUrl.replace(/\/$/, "")}/pending?channelId=${encodeURIComponent(channelId)}`,
    {
      method: "DELETE"
    }
  );

  if (!response.ok) {
    throw new Error(`Orchestrator respondeu com ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as { cleared: boolean };
}

async function sendTelegramMessage(chatId: number, message: string): Promise<void> {
  for (const chunk of splitTelegramMessage(message)) {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: chunk
    });
  }
}

async function setTelegramMessageReaction(chatId: number, messageId: number, emojis: string[]): Promise<void> {
  const errors: string[] = [];

  for (const emoji of emojis) {
    try {
      await callTelegramApi("setMessageReaction", {
        chat_id: chatId,
        message_id: messageId,
        reaction: [
          {
            type: "emoji",
            emoji
          }
        ]
      });
      return;
    } catch (error) {
      errors.push(`${emoji}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.warn(
    `[telegram-gateway] Não foi possível reagir à mensagem ${messageId}: ${errors.join(" | ")}`
  );
}

async function callTelegramApi<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload ?? {})
  });

  const body = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram respondeu com ${response.status} ${response.statusText}`);
  }

  return body.result as T;
}

function getChannelId(message: TelegramMessage): string {
  return `telegram:${message.chat.id}`;
}

function parseTelegramChatId(channelId: string): number | null {
  const raw = channelId.startsWith("telegram:") ? channelId.slice("telegram:".length) : channelId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getUserId(message: TelegramMessage): string {
  return `telegram:${message.from?.id ?? message.chat.id}`;
}

function getUsername(message: TelegramMessage): string {
  const from = message.from;
  if (!from) {
    return String(message.chat.id);
  }

  if (from.username) {
    return `@${from.username}`;
  }

  return [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || String(from.id);
}

function isLinkCodeCommand(content: string): boolean {
  return /^!code\b/i.test(content.trim());
}

function extractLinkCode(content: string): string | null {
  const match = content.trim().match(/^!code\s+([A-Za-z0-9-]+)/i);
  return match?.[1] ?? null;
}

function formatPendingCommandMessage(pending: PendingCommandState | null): string {
  if (!pending) {
    return "Não há nenhum pedido pendente neste momento.";
  }

  return [
    "Estado atual do pedido:",
    `command: ${pending.command}`,
    `extractedData: ${JSON.stringify(pending.extractedData ?? {})}`,
    pending.missingFields.length > 0 ? `missingFields: ${pending.missingFields.join(", ")}` : "",
    pending.followUpQuestion.trim() ? `followUpQuestion: ${pending.followUpQuestion}` : "",
    "O pedido continua ativo. Podes continuar a responder normalmente."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCommandsHelpMessage(): string {
  return [
    "Não reconheci esse comando.",
    "Comandos disponíveis:",
    "!code CODIGO - liga este chat ao código ativo da dashboard.",
    "!cancel - cancela o pedido pendente atual.",
    "!show - mostra o estado atual do pedido pendente."
  ].join("\n");
}

function splitTelegramMessage(content: string): string[] {
  if (content.length <= TELEGRAM_MESSAGE_LIMIT) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    const window = remaining.slice(0, TELEGRAM_MESSAGE_LIMIT);
    const splitAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const index = splitAt > 0 ? splitAt : TELEGRAM_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function isAuthorizedInternalRequest(request: IncomingMessage): boolean {
  return request.headers["x-internal-api-token"] === env.dashboardInternalApiToken;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function safeJsonParse(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function validateEnv(): void {
  const missing: string[] = [];

  if (!env.dashboardInternalApiToken) {
    missing.push("DASHBOARD_INTERNAL_API_TOKEN");
  }

  if (!env.telegramBotToken) {
    missing.push("TELEGRAM_BOT_TOKEN");
  }

  if (!env.orchestratorUrl) {
    missing.push("ORCHESTRATOR_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Faltam variáveis de ambiente obrigatórias: ${missing.join(", ")}`);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[telegram-gateway] A terminar (${signal})...`);
  stopping = true;
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

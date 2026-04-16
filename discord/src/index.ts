import "dotenv/config";

import {
  Client,
  GatewayIntentBits,
  type Message,
  type MessageReaction,
  Partials
} from "discord.js";

type OrchestratorResponse = {
  reply?: string;
  interpretation?: {
    command?: string;
    hasCommand?: boolean;
    confidence?: number;
    extractedData?: Record<string, unknown>;
    needsCalendarAction?: boolean;
    notes?: string;
  };
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
  channelId: string;
  userId: string;
  username?: string | null;
  linkedAt?: string | null;
};

type RawMessageCreatePayload = {
  id?: string;
  channel_id?: string;
  guild_id?: string;
  content?: string;
  author?: {
    id?: string;
    bot?: boolean;
  };
};

const env = {
  discordToken: process.env.DISCORD_TOKEN ?? "",
  orchestratorUrl: process.env.ORCHESTRATOR_URL ?? "http://orchestrator:8000",
  dashboardServiceUrl: process.env.DASHBOARD_SERVICE_URL ?? "http://dashboard-service:8088",
  dashboardBaseUrl: process.env.DASHBOARD_BASE_URL ?? "http://localhost:8088",
  dashboardInternalApiToken:
    process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "pulse_dashboard_internal_token_change_me",
  runtimeConfigTtlMs: Number(process.env.DASHBOARD_CONFIG_CACHE_MS ?? "3000")
};

const PROCESSING_EMOJI = "⏳";
const SUCCESS_EMOJI = "✅";
const ERROR_EMOJI = "❌";
const DISCORD_MESSAGE_LIMIT = 1900;

validateEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

const processedMessageIds = new Map<string, number>();

client.once("clientReady", () => {
  const username = client.user?.tag ?? client.user?.username ?? "desconhecido";
  console.log(`[gateway] Ligado ao Discord como ${username}`);
  console.log("[gateway] A ouvir mensagens diretas em tempo real.");
});

client.on("messageCreate", (message) => {
  markMessageAsProcessed(message.id);
  console.log(
    `[gateway] messageCreate: author=${message.author?.id ?? "?"} bot=${
      message.author?.bot ? "true" : "false"
    } channel=${message.channel?.id ?? "?"} inGuild=${message.inGuild()} dmBased=${
      message.channel?.isDMBased?.() ? "true" : "false"
    } partial=${message.partial ? "true" : "false"} content=${JSON.stringify(
      message.content ?? ""
    )}`
  );
  void handleIncomingMessage(message);
});

client.on("raw", (packet) => {
  if (packet.t === "MESSAGE_CREATE") {
    const data = packet.d as RawMessageCreatePayload;

    console.log(
      `[gateway] raw MESSAGE_CREATE: author=${data.author?.id ?? "?"} bot=${
        data.author?.bot ? "true" : "false"
      } channel=${data.channel_id ?? "?"} guild=${data.guild_id ?? "dm"} content=${JSON.stringify(
        data.content ?? ""
      )}`
    );

    void handleRawMessageCreate(data);
  }
});

client.on("warn", (message) => {
  console.warn("[gateway] Aviso do cliente Discord:", message);
});

client.on("shardError", (error) => {
  console.error("[gateway] Erro de shard Discord:", error);
});

client.on("error", (error) => {
  console.error("[gateway] Erro do cliente Discord:", error);
});

async function main(): Promise<void> {
  await client.login(env.discordToken);
}

async function handleRawMessageCreate(payload: RawMessageCreatePayload): Promise<void> {
  if (!payload.id || !payload.channel_id || payload.guild_id || payload.author?.bot) {
    return;
  }

  await sleep(750);

  if (hasRecentlyProcessedMessage(payload.id)) {
    return;
  }

  try {
    const channel = await client.channels.fetch(payload.channel_id);
    if (!channel || !channel.isDMBased() || !("messages" in channel)) {
      return;
    }

    const message = await channel.messages.fetch(payload.id);
    if (hasRecentlyProcessedMessage(message.id)) {
      return;
    }

    markMessageAsProcessed(message.id);
    console.log(`[gateway] raw fallback: mensagem ${message.id} resolvida a partir do evento raw.`);
    await handleIncomingMessage(message);
  } catch (error) {
    console.error(
      `[gateway] Falha no fallback raw para a mensagem ${payload.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function handleIncomingMessage(message: Message): Promise<void> {
  if (message.partial) {
    try {
      await message.fetch();
    } catch (error) {
      console.error("[gateway] Não foi possível resolver a mensagem parcial:", error);
      return;
    }
  }

  if (!shouldProcessMessage(message)) {
    return;
  }

  if (!message.content.trim()) {
    await sendMessage(
      message.channel,
      "Para já só consigo processar mensagens de texto nesta conversa."
    );
    return;
  }

  if (isLinkCodeCommand(message.content)) {
    await handleLinkCodeCommand(message);
    return;
  }

  const runtimeConfig = await resolveRuntimeConfigForMessage(message.channel.id, message.author.id);
  if (!runtimeConfig) {
    await sendMessage(
      message.channel,
      [
        "Esta conversa ainda não está ligada ao bot nesta dashboard.",
        `Abre ${env.dashboardBaseUrl} para ver o código atual e envia aqui \`!code CODIGO\`.`,
        "Depois disso esta DM fica associada automaticamente."
      ].join("\n")
    );
    return;
  }

  if (message.content.trim().startsWith("!")) {
    await handleCommandMessage(message);
    return;
  }

  let processingReaction: MessageReaction | null = null;

  try {
    processingReaction = await addReaction(message, PROCESSING_EMOJI);

    const outcome = await buildReply(message);
    await sendReplyToDiscord(message, outcome.reply);

    if (processingReaction) {
      await removeOwnReaction(processingReaction).catch(() => undefined);
    }

    await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
  } catch (error) {
    if (processingReaction) {
      await removeOwnReaction(processingReaction).catch(() => undefined);
    }

    await addReaction(message, ERROR_EMOJI).catch(() => undefined);

    const fallbackMessage =
      "Ocorreu um erro a processar a tua mensagem. Tenta novamente dentro de instantes.";

    await sendMessage(message.channel, fallbackMessage).catch(() => undefined);
    console.error("[gateway] Erro ao tratar mensagem:", error);
  }
}

function shouldProcessMessage(message: Message): boolean {
  if (message.author.bot || message.system) {
    return false;
  }

  return message.channel.isDMBased() && !message.inGuild();
}

function isLinkCodeCommand(content: string): boolean {
  return /^!code\b/i.test(content.trim());
}

function hasRecentlyProcessedMessage(messageId: string): boolean {
  pruneProcessedMessageIds();
  const processedAt = processedMessageIds.get(messageId);
  return typeof processedAt === "number";
}

function markMessageAsProcessed(messageId: string): void {
  pruneProcessedMessageIds();
  processedMessageIds.set(messageId, Date.now());
}

function pruneProcessedMessageIds(): void {
  const threshold = Date.now() - 5 * 60 * 1000;
  for (const [messageId, processedAt] of processedMessageIds.entries()) {
    if (processedAt < threshold) {
      processedMessageIds.delete(messageId);
    }
  }
}

async function handleLinkCodeCommand(message: Message): Promise<void> {
  const code = extractLinkCode(message.content);
  if (!code) {
    await sendMessage(
      message.channel,
      "Formato esperado: `!code ABCD-1234`. Abre a dashboard para ver o código atual."
    );
    await addReaction(message, ERROR_EMOJI).catch(() => undefined);
    return;
  }

  try {
    const result = await claimLinkCode({
      code,
      channelId: message.channel.id,
      userId: message.author.id,
      username: message.author.globalName ?? message.author.username
    });

    await sendMessage(
      message.channel,
      result.alreadyLinked
        ? [
            "Esta conversa já estava ligada.",
            "Podes continuar a falar comigo normalmente, por exemplo: `Marca reunião amanhã às 11` ou `O que tenho hoje?`",
            "Se faltar algum detalhe, eu pergunto-te aqui na conversa."
          ].join("\n")
        : [
            "Ligação concluída com sucesso.",
            "Esta DM ficou associada à tua conta da dashboard e já posso agir sobre a tua agenda a partir daqui.",
            "Podes escrever diretamente coisas como `Marca reunião amanhã às 11` ou `O que tenho hoje?`",
            "Se faltar alguma informação, eu faço as perguntas certas para completar o pedido."
          ].join("\n")
    );
    await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await sendMessage(message.channel, messageText);
    await addReaction(message, ERROR_EMOJI).catch(() => undefined);
  }
}

async function handleCommandMessage(message: Message): Promise<void> {
  try {
    const trimmedContent = message.content.trim();
    const [rawCommand = ""] = trimmedContent.split(/\s+/, 1);
    const command = rawCommand.toLowerCase();

    if (command === "!delete") {
      const deleteLimit = parseDeleteLimit(message.content);
      await clearBotMessages(message, deleteLimit);
      await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
      return;
    }

    if (command === "!cancel") {
      const result = await cancelPendingCommand(message.channel.id);
      await sendMessage(
        message.channel,
        result.cleared
          ? "Pedido atual cancelado. Podes começar outro quando quiseres."
          : "Não há nenhum pedido pendente neste momento."
      );
      await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
      return;
    }

    if (command === "!show") {
      const pending = await fetchPendingCommand(message.channel.id);
      await sendMessage(message.channel, formatPendingCommandMessage(pending));
      await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
      return;
    }

    await sendMessage(message.channel, buildCommandsHelpMessage());
    await addReaction(message, SUCCESS_EMOJI).catch(() => undefined);
  } catch (error) {
    await addReaction(message, ERROR_EMOJI).catch(() => undefined);
    console.error("[gateway] Erro ao tratar comando:", error);
  }
}

async function buildReply(message: Message): Promise<{ reply: string }> {
  const response = await fetch(`${env.orchestratorUrl.replace(/\/$/, "")}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      source: "discord-dm",
      channelId: message.channel.id,
      userId: message.author.id,
      username: message.author.globalName ?? message.author.username,
      messageId: message.id,
      content: message.content,
      timestamp: message.createdAt.toISOString()
    })
  });

  if (!response.ok) {
    throw new Error(
      `Orchestrator respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as OrchestratorResponse;

  if (!body.reply) {
    throw new Error("O orchestrator não devolveu o campo 'reply'.");
  }

  console.log("[gateway] Interpretação recebida do orchestrator:", body.interpretation);

  return {
    reply: body.reply
  };
}

async function sendReplyToDiscord(message: Message, reply: string): Promise<void> {
  await sendMessage(message.channel, reply);
}

async function fetchPendingCommand(channelId: string): Promise<PendingCommandState | null> {
  const response = await fetch(
    `${env.orchestratorUrl.replace(/\/$/, "")}/pending?channelId=${encodeURIComponent(
      channelId
    )}`
  );

  if (!response.ok) {
    throw new Error(
      `Orchestrator respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    pending?: PendingCommandState | null;
  };

  return body.pending ?? null;
}

async function cancelPendingCommand(channelId: string): Promise<{ cleared: boolean }> {
  const response = await fetch(
    `${env.orchestratorUrl.replace(/\/$/, "")}/pending?channelId=${encodeURIComponent(
      channelId
    )}`,
    {
      method: "DELETE"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Orchestrator respondeu com ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as { cleared: boolean };
}

async function clearBotMessages(commandMessage: Message, limit: number): Promise<void> {
  const fetched = await commandMessage.channel.messages.fetch({
    limit: Math.max(20, Math.min(limit + 20, 100))
  });

  const botMessages = [...fetched.values()]
    .filter((message) => message.author.id === client.user?.id)
    .sort((left, right) => right.createdTimestamp - left.createdTimestamp)
    .slice(0, limit);

  for (const botMessage of botMessages) {
    if (!botMessage.deletable) {
      continue;
    }

    try {
      await botMessage.delete();
    } catch (error) {
      console.log(
        `[gateway] Não foi possível apagar a mensagem do bot ${botMessage.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (commandMessage.deletable) {
    await commandMessage.delete().catch(() => undefined);
  }
}

async function resolveRuntimeConfigForMessage(
  channelId: string,
  userId: string
): Promise<RuntimeBotConfig | null> {
  try {
    const response = await fetch(
      `${env.dashboardServiceUrl.replace(/\/$/, "")}/api/runtime-config/resolve?channelId=${encodeURIComponent(
        channelId
      )}&userId=${encodeURIComponent(userId)}`,
      {
        headers: {
          "x-internal-api-token": env.dashboardInternalApiToken
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Dashboard respondeu com ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      configured?: boolean;
      config?: {
        dashboardUserId?: string;
        channelId?: string;
        userId?: string;
        username?: string | null;
        linkedAt?: string | null;
      } | null;
    };

    return body.configured && body.config?.channelId && body.config?.userId
      ? {
          dashboardUserId: body.config.dashboardUserId,
          channelId: body.config.channelId,
          userId: body.config.userId,
          username: body.config.username,
          linkedAt: body.config.linkedAt
        }
      : null;
  } catch (error) {
    console.error(
      `[gateway] Não foi possível ler a configuração da dashboard: ${
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
}): Promise<RuntimeBotConfig & { alreadyLinked?: boolean }> {
  const response = await fetch(
    `${env.dashboardServiceUrl.replace(/\/$/, "")}/api/link-code/claim`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-token": env.dashboardInternalApiToken
      },
      body: JSON.stringify(input)
    }
  );

  const body = (await response.json()) as {
    success?: boolean;
    error?: string;
    alreadyLinked?: boolean;
    config?: {
      channelId?: string;
      userId?: string;
      username?: string | null;
      linkedAt?: string | null;
    } | null;
  };

  if (!response.ok || !body.success || !body.config?.channelId || !body.config?.userId) {
    throw new Error(body.error ?? `Não foi possível ligar a conversa (${response.status}).`);
  }

  return {
    channelId: body.config.channelId,
    userId: body.config.userId,
    username: body.config.username,
    linkedAt: body.config.linkedAt,
    alreadyLinked: body.alreadyLinked
  };
}

async function sendMessage(channel: Message["channel"], message: string): Promise<void> {
  if (!channel.isSendable()) {
    throw new Error("O canal recebido do Discord não aceita envio de mensagens.");
  }

  for (const chunk of splitDiscordMessage(message)) {
    await channel.send({ content: chunk });
  }
}

async function addReaction(
  message: Message,
  emoji: string
): Promise<MessageReaction | null> {
  try {
    return await message.react(emoji);
  } catch {
    return null;
  }
}

async function removeOwnReaction(reaction: MessageReaction): Promise<void> {
  const botUserId = client.user?.id;
  if (!botUserId) {
    return;
  }

  await reaction.users.remove(botUserId);
}

function splitDiscordMessage(content: string): string[] {
  if (content.length <= DISCORD_MESSAGE_LIMIT) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    const window = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
    const splitAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
    const index = splitAt > 0 ? splitAt : DISCORD_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function parseDeleteLimit(content: string): number {
  const parts = content.trim().split(/\s+/);

  if (parts.length < 2) {
    return 50;
  }

  const parsed = Number(parts[1]);

  if (Number.isNaN(parsed) || parsed < 1) {
    return 50;
  }

  return Math.min(parsed, 100);
}

function extractLinkCode(content: string): string | null {
  const match = content.trim().match(/^!code\s+([A-Za-z0-9-]+)/i);
  if (!match) {
    return null;
  }

  return match[1];
}

function formatPendingCommandMessage(pending: PendingCommandState | null): string {
  if (!pending) {
    return "Não há nenhum pedido pendente neste momento.";
  }

  const extracted = pending.extractedData ?? {};
  const lines = [
    "Estado atual do pedido:",
    `command: ${pending.command}`,
    "extractedData:"
  ];

  const preferredOrder = [
    "title",
    "date",
    "startTime",
    "time",
    "rawTime",
    "endTime",
    "description",
    "category"
  ];

  const seenKeys = new Set<string>();
  for (const key of preferredOrder) {
    if (key in extracted) {
      lines.push(`  ${key}: ${formatPendingValue(extracted[key])}`);
      seenKeys.add(key);
    }
  }

  for (const [key, value] of Object.entries(extracted)) {
    if (seenKeys.has(key)) {
      continue;
    }

    lines.push(`  ${key}: ${formatPendingValue(value)}`);
  }

  if (pending.missingFields.length > 0) {
    lines.push(`missingFields: ${pending.missingFields.join(", ")}`);
  }

  if (pending.followUpQuestion.trim()) {
    lines.push(`followUpQuestion: ${pending.followUpQuestion}`);
  }

  lines.push("O pedido continua ativo. Podes continuar a responder normalmente.");

  return lines.join("\n");
}

function formatPendingValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return value.length > 0 ? value : "''";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? JSON.stringify(value) : "[]";
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return "undefined";
}

function buildCommandsHelpMessage(): string {
  return [
    "Não reconheci esse comando.",
    "Comandos disponíveis:",
    "!code CODIGO - liga esta conversa ao código ativo da dashboard.",
    "!delete - apaga mensagens do bot nesta conversa.",
    "!delete N - apaga as últimas N mensagens do bot.",
    "!cancel - cancela o pedido pendente atual.",
    "!show - mostra o estado atual do pedido pendente."
  ].join("\n");
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function validateEnv(): void {
  const missing: string[] = [];

  if (!env.discordToken) {
    missing.push("DISCORD_TOKEN");
  }

  if (!env.orchestratorUrl) {
    missing.push("ORCHESTRATOR_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Faltam variáveis de ambiente obrigatórias: ${missing.join(", ")}`
    );
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[gateway] A terminar (${signal})...`);
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void main().catch(async (error) => {
  console.error("[gateway] Falha no arranque:", error);
  client.destroy();
  process.exit(1);
});

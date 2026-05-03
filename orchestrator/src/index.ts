import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { Pool } from "pg";

type DiscordMessageInput = {
  source: string;
  channelId: string;
  userId: string;
  username: string;
  messageId: string;
  content: string;
  timestamp: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type PendingCommand = {
  command: LlmInterpretation["command"];
  extractedData: Record<string, unknown>;
  missingFields: string[];
  lastUserMessage: string;
  followUpQuestion: string;
  updatedAt: string;
};

type TemporalHint = {
  expression: string;
  type: "date" | "range" | "month" | "weekday";
  date?: string;
  startDate?: string;
  endDate?: string;
  label: string;
};

type TemporalExpression = {
  text: string;
  kind:
    | "relative_day"
    | "relative_range"
    | "relative_offset"
    | "weekday"
    | "month"
    | "year"
    | "part_of_day";
  direction?: "past" | "current" | "future";
  unit?: "day" | "week" | "month" | "year";
  amount?: number;
  weekday?: string;
  month?: string;
  partOfDay?: "morning" | "afternoon" | "evening" | "night";
};

type NormalizationResult = {
  originalText: string;
  correctedText: string;
  normalizedText: string;
  temporalExpressions: TemporalExpression[];
  notes: string[];
};

type LlmInterpretation = {
  command:
    | "chat"
    | "create_event"
    | "list_events"
    | "delete_event"
    | "update_event"
    | "unknown";
  hasCommand: boolean;
  confidence: number;
  isComplete: boolean;
  reply: string;
  extractedData: Record<string, unknown>;
  fieldEvidence?: Record<
    string,
    {
      excerpt: string;
      reason: string;
    }
  >;
  needsCalendarAction: boolean;
  shouldAskFollowUp: boolean;
  missingFields: string[];
  followUpQuestion: string;
  notes: string;
};

type CalendarCreateEventResponse = {
  success: boolean;
  reply?: string;
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
  url?: string;
};

type CalendarSearchEventsResponse = {
  success: boolean;
  events: CalendarEventSummary[];
  total: number;
};

type CalendarDeleteEventsResponse = {
  success: boolean;
  deletedCount: number;
  deletedEvents: CalendarEventSummary[];
  reply: string;
};

type CalendarUpdateEventsResponse = {
  success: boolean;
  updatedCount: number;
  updatedEvents: CalendarEventSummary[];
  reply: string;
};

type CalendarSearchFilters = {
  title?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
};

type DeleteSearchQuery = CalendarSearchFilters & {
  rawDate?: string;
  deleteAllRequested?: boolean;
};

type ListEventsQuery = CalendarSearchFilters & {
  rawPeriod?: string;
  summaryMode?: boolean;
  grouping?: "day" | "week";
};

type UpdateEventDraft = {
  targetTitle?: string;
  targetDate?: string;
  targetRawDate?: string;
  targetDateFrom?: string;
  targetDateTo?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  newDate?: string;
  newRawDate?: string;
  newStartTime?: string;
  newEndTime?: string;
  keepTime?: boolean;
  requiresExplicitTime?: boolean;
  matchedEvents?: CalendarEventSummary[];
  selectedEvents?: CalendarEventSummary[];
};

type CreateEventDraft = {
  title?: string;
  date?: string;
  endDate?: string;
  rawDate?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
  category?: string;
  allDay?: boolean;
  __descriptionSkipped?: boolean;
};

type WeeklyRecurrence = {
  frequency: "weekly";
  weekday: string;
  raw: string;
  firstDate: string;
  untilDate?: string;
  untilRaw?: string;
};

type ExtractionResult = {
  command: LlmInterpretation["command"];
  confidence: number;
  extractedData: Record<string, unknown>;
  fieldEvidence: Record<
    string,
    {
      excerpt: string;
      reason: string;
    }
  >;
  missingFields: string[];
  notes: string;
};

type ValidationResult = {
  command: LlmInterpretation["command"];
  approved: boolean;
  confidence: number;
  extractedData: Record<string, unknown>;
  fieldEvidence: Record<
    string,
    {
      excerpt: string;
      reason: string;
    }
  >;
  missingFields: string[];
  shouldAskFollowUp: boolean;
  followUpQuestion: string;
  notes: string;
};

type MultiAgentContext = {
  app: string;
  assistantName: string;
  channelType: string;
  allowedCommands: Array<{
    name: string;
    description: string;
  }>;
  responseLanguage: string;
  outputSchemaVersion: string;
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
  timezone: string;
  temporalHints: TemporalHint[];
  normalization: NormalizationResult;
};

type PlannerTimings = {
  normalizationMs: number;
  interpretMs: number;
  totalMs: number;
};

type PlannerTrace = {
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
  normalization: NormalizationResult;
  temporalHints: TemporalHint[];
  timings?: PlannerTimings;
};

type MultiAgentTimings = {
  contextMs: number;
  extractorMs: number;
  validatorMs: number;
  totalMs: number;
};

type MultiAgentTrace = {
  context: MultiAgentContext;
  extraction: ExtractionResult;
  validation: ValidationResult;
  timings?: MultiAgentTimings;
};

type CalendarTrace = {
  operation?: "create_event" | "delete_event" | "update_event";
  attempted: boolean;
  executed: boolean;
  success: boolean;
  durationMs?: number;
  result?:
    | CalendarCreateEventResponse
    | CalendarDeleteEventsResponse
    | CalendarUpdateEventsResponse;
  error?: string;
};

type MessageProcessingTimings = {
  totalMs: number;
  plannerMs?: number;
  plannerNormalizationMs?: number;
  plannerInterpretMs?: number;
  multiAgentMs?: number;
  multiAgentContextMs?: number;
  extractorMs?: number;
  validatorMs?: number;
  calendarMs?: number;
};

type MessageProcessingTrace = {
  pendingBefore: PendingCommand | null;
  pendingReset: boolean;
  historyUsed: ConversationMessage[];
  planner: {
    trace: PlannerTrace;
    interpretation: LlmInterpretation;
  };
  multiAgent?: MultiAgentTrace;
  normalizedInterpretation: LlmInterpretation;
  finalInterpretation: LlmInterpretation;
  pendingAfter: PendingCommand | null;
  calendar: CalendarTrace;
  timings?: MessageProcessingTimings;
};

type MessageProcessingOptions = {
  persistState: boolean;
  persistConversation: boolean;
  executeCalendarAction: boolean;
  includeTrace: boolean;
  resetPending: boolean;
  mockCalendarSearchResults?: CalendarEventSummary[];
};

type ProcessMessageResult = {
  reply: string;
  interpretation: LlmInterpretation;
  trace?: MessageProcessingTrace;
};

type DebugMessageRequest = {
  message: DiscordMessageInput;
  options?: Partial<MessageProcessingOptions>;
};

const env = {
  port: Number(process.env.ORCHESTRATOR_PORT ?? "8000"),
  postgresUrl:
    process.env.POSTGRES_URL ??
    "postgres://agentpulse:agentpulse_dev_password@postgres:5432/agentpulse",
  llmServiceUrl: process.env.LLM_SERVICE_URL ?? "http://llm-service:8001",
  normalizerServiceUrl:
    process.env.NORMALIZER_SERVICE_URL ?? "http://normalizer-service:8002",
  calendarServiceUrl:
    process.env.CALENDAR_SERVICE_URL ?? "http://calendar-service:8003",
  extractorServiceUrl:
    process.env.EXTRACTOR_SERVICE_URL ?? "http://extractor-service:8004",
  validatorServiceUrl:
    process.env.VALIDATOR_SERVICE_URL ?? "http://validator-service:8005",
  internalApiToken:
    process.env.DASHBOARD_INTERNAL_API_TOKEN ?? "pulse_dashboard_internal_token_change_me",
  historyLimit: Number(process.env.ORCHESTRATOR_HISTORY_LIMIT ?? "12"),
  contextTtlMs: Number(process.env.ORCHESTRATOR_CONTEXT_TTL_MS ?? `${20 * 60 * 1000}`),
  timezone: process.env.APP_TIMEZONE ?? "Europe/Lisbon",
  timingLogs:
    (process.env.ORCHESTRATOR_TIMING_LOGS ?? "true").toLowerCase() === "true"
};

validateEnv();

const pool = new Pool({
  connectionString: env.postgresUrl
});

const allowedCommands = [
  {
    name: "create_event",
    description: "Criar um evento no calendario a partir de linguagem natural."
  },
  {
    name: "list_events",
    description: "Listar eventos por data, periodo ou dia pedido pelo utilizador."
  },
  {
    name: "delete_event",
    description: "Apagar um evento especifico do calendario."
  },
  {
    name: "update_event",
    description: "Alterar a data, hora ou outros detalhes de um evento existente."
  }
];

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const path = requestUrl.pathname;

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        service: "orchestrator",
        llmServiceUrl: env.llmServiceUrl,
        normalizerServiceUrl: env.normalizerServiceUrl
      });
    }

    if (method === "POST" && path === "/messages") {
      const payload = (await readJsonBody(request)) as DiscordMessageInput;

      validateMessagePayload(payload);
      const result = await processMessagePayload(payload, {
        persistState: true,
        persistConversation: true,
        executeCalendarAction: true,
        includeTrace: false,
        resetPending: false
      });

      return sendJson(response, 200, result);
    }

    if (method === "POST" && path === "/debug/messages") {
      const payload = (await readJsonBody(request)) as DebugMessageRequest;

      validateDebugMessageRequest(payload);

      const result = await processMessagePayload(payload.message, {
        persistState: payload.options?.persistState ?? true,
        persistConversation: payload.options?.persistConversation ?? true,
        executeCalendarAction: payload.options?.executeCalendarAction ?? false,
        includeTrace: true,
        resetPending: payload.options?.resetPending ?? false,
        mockCalendarSearchResults: payload.options?.mockCalendarSearchResults
      });

      return sendJson(response, 200, result);
    }

    if (method === "GET" && path === "/pending") {
      const channelId = requestUrl.searchParams.get("channelId")?.trim();

      if (!channelId) {
        return sendJson(response, 400, {
          error: "channelId e obrigatorio."
        });
      }

      return sendJson(response, 200, {
        pending: await getPendingCommandState(channelId, new Date())
      });
    }

    if (method === "DELETE" && path === "/pending") {
      const channelId = requestUrl.searchParams.get("channelId")?.trim();

      if (!channelId) {
        return sendJson(response, 400, {
          error: "channelId e obrigatorio."
        });
      }

      const cleared = await clearPendingCommand(channelId);

      return sendJson(response, 200, {
        cleared
      });
    }

    if (method === "POST" && path === "/internal/conversations/purge") {
      if (!isAuthorizedInternalRequest(request)) {
        return sendJson(response, 401, {
          success: false,
          error: "Nao autorizado."
        });
      }

      const payload = (await readJsonBody(request)) as { channelId?: string };
      const channelId = typeof payload?.channelId === "string" ? payload.channelId.trim() : "";

      if (!channelId) {
        return sendJson(response, 400, {
          success: false,
          error: "channelId e obrigatorio."
        });
      }

      const result = await purgeConversationData(channelId);
      return sendJson(response, 200, {
        success: true,
        ...result
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[orchestrator] Erro:", error);

    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

void main().catch((error) => {
  console.error("[orchestrator] Falha no arranque:", error);
  process.exit(1);
});

async function main(): Promise<void> {
  await initializeDatabase();

  server.listen(env.port, () => {
    console.log(
      `[orchestrator] A escutar na porta ${env.port} e a usar ${env.llmServiceUrl}`
    );
  });
}

function validateDebugMessageRequest(payload: DebugMessageRequest): void {
  if (!payload || typeof payload !== "object" || !payload.message) {
    throw new Error("Payload invalido. Esperado: { message, options? }.");
  }

  validateMessagePayload(payload.message);
}

function resolveReferenceTime(timestamp: string | null | undefined): Date {
  if (typeof timestamp === "string") {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function isTimestampOlderThanWindow(
  timestamp: string | null | undefined,
  referenceTime: Date,
  windowMs: number
): boolean {
  if (windowMs <= 0) {
    return false;
  }

  if (typeof timestamp !== "string") {
    return false;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return referenceTime.getTime() - parsed.getTime() > windowMs;
}

function filterConversationHistoryToRecentWindow(
  history: ConversationMessage[],
  referenceTime: Date,
  windowMs: number
): ConversationMessage[] {
  if (windowMs <= 0 || history.length === 0) {
    return history;
  }

  const thresholdMs = referenceTime.getTime() - windowMs;
  return history.filter((message) => {
    const parsed = new Date(message.timestamp);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= thresholdMs;
  });
}

async function processMessagePayload(
  payload: DiscordMessageInput,
  options: MessageProcessingOptions
): Promise<ProcessMessageResult> {
  const processingStartedAt = Date.now();
  const referenceTime = resolveReferenceTime(payload.timestamp);
  const storedPendingCommand = await getPendingCommandState(payload.channelId, referenceTime);
  const shouldResetPending =
    options.resetPending ||
    shouldResetPendingForFreshCreateEvent(payload.content, storedPendingCommand) ||
    shouldResetPendingForFreshUpdateEvent(payload.content, storedPendingCommand);

  if (shouldResetPending && storedPendingCommand && options.persistState) {
    await clearPendingCommand(payload.channelId);
  }

  const pendingCommand = shouldResetPending ? null : storedPendingCommand;
  const fullHistory =
    !shouldResetPending && options.persistConversation
      ? filterConversationHistoryToRecentWindow(
          await getConversationHistory(payload.channelId),
          referenceTime,
          env.contextTtlMs
        )
      : [];

  const plannerResult = await callLlmServiceWithTrace(
    payload,
    pendingCommand,
    fullHistory
  );

  let interpretation = plannerResult.interpretation;
  let multiAgentTrace: MultiAgentTrace | undefined;

  if (
    shouldUseCreateEventMultiAgent(
      plannerResult.interpretation,
      pendingCommand,
      payload.content
    )
  ) {
    const multiAgentResult = await buildCreateEventInterpretationWithAgentsDetailed(
      payload,
      pendingCommand,
      fullHistory,
      plannerResult.interpretation
    );
    interpretation = multiAgentResult.interpretation;
    multiAgentTrace = {
      context: multiAgentResult.context,
      extraction: multiAgentResult.extraction,
      validation: multiAgentResult.validation,
      timings: multiAgentResult.timings
    };
  }

  const effectiveMessageContent =
    plannerResult.trace.normalization.correctedText.trim() || payload.content;

  const normalizedInterpretation = normalizeInterpretation(
    payload,
    interpretation,
    pendingCommand,
    effectiveMessageContent
  );

  let finalInterpretation = shouldHandleAdvancedCreateEvent(
    payload,
    normalizedInterpretation,
    pendingCommand
  )
    ? resolveAdvancedCreateEventInterpretation(
        payload,
        normalizedInterpretation,
        pendingCommand
      )
    : shouldHandleUpdateEvent(
          payload,
          normalizedInterpretation,
          pendingCommand,
          effectiveMessageContent
        )
      ? await resolveUpdateEventInterpretation(
          payload,
          normalizedInterpretation,
          pendingCommand,
          options,
          effectiveMessageContent
        )
    : shouldHandleListEvents(
          normalizedInterpretation,
          pendingCommand,
          effectiveMessageContent
        ) ||
        shouldContinueRecentListEventsContext(
          effectiveMessageContent,
          fullHistory,
          pendingCommand
        )
      ? await resolveListEventsInterpretation(
          payload,
          normalizedInterpretation,
          pendingCommand,
          options,
          effectiveMessageContent,
          fullHistory
        )
    : shouldHandleDeleteEvent(normalizedInterpretation, pendingCommand)
      ? await resolveDeleteEventInterpretation(
          payload,
          normalizedInterpretation,
          pendingCommand,
          options
        )
      : normalizedInterpretation;
  let shouldUpdatePending = options.persistState;
  const calendarTrace: CalendarTrace = {
    attempted: false,
    executed: false,
    success: false
  };
  let calendarDurationMs = 0;

  if (shouldCreateCalendarBatch(finalInterpretation)) {
    calendarTrace.operation = "create_event";
    calendarTrace.attempted = true;
  } else if (shouldCreateCalendarEvent(finalInterpretation)) {
    calendarTrace.operation = "create_event";
    calendarTrace.attempted = true;
  } else if (shouldDeleteCalendarEvents(finalInterpretation)) {
    calendarTrace.operation = "delete_event";
    calendarTrace.attempted = true;
  } else if (shouldUpdateCalendarEvents(finalInterpretation)) {
    calendarTrace.operation = "update_event";
    calendarTrace.attempted = true;
  }

  if (options.executeCalendarAction && shouldCreateCalendarBatch(finalInterpretation)) {
    calendarTrace.executed = true;
    const calendarStartedAt = Date.now();
    try {
      const calendarResult = await createCalendarBatch(payload, finalInterpretation.extractedData);

      calendarTrace.success = true;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.result = calendarResult.firstResult;
      finalInterpretation = {
        ...finalInterpretation,
        reply: calendarResult.reply,
        needsCalendarAction: true,
        shouldAskFollowUp: false,
        followUpQuestion: "",
        missingFields: []
      };
    } catch (error) {
      console.error("[orchestrator] Falha ao guardar eventos na agenda:", error);
      calendarTrace.success = false;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.error =
        error instanceof Error ? error.message : "Falha desconhecida no calendar-service";
      shouldUpdatePending = false;
      if (options.persistState) {
        await clearPendingCommand(payload.channelId);
      }
      finalInterpretation = {
        ...finalInterpretation,
        reply:
          "Percebi os eventos, mas nao os consegui guardar na agenda. Tenta novamente.",
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: ""
      };
    }
  } else if (options.executeCalendarAction && shouldCreateCalendarEvent(finalInterpretation)) {
    calendarTrace.executed = true;
    const calendarStartedAt = Date.now();
    try {
      const calendarResult = await createCalendarEvent(
        payload,
        finalInterpretation.extractedData
      );

      calendarTrace.success = true;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.result = calendarResult;
      finalInterpretation = {
        ...finalInterpretation,
        reply: calendarResult.reply ?? finalInterpretation.reply,
        needsCalendarAction: true,
        shouldAskFollowUp: false,
        followUpQuestion: "",
        missingFields: []
      };
    } catch (error) {
      console.error("[orchestrator] Falha ao guardar evento na agenda:", error);
      calendarTrace.success = false;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.error =
        error instanceof Error ? error.message : "Falha desconhecida no calendar-service";
      shouldUpdatePending = false;
      if (options.persistState) {
        await clearPendingCommand(payload.channelId);
      }
      finalInterpretation = {
        ...finalInterpretation,
        reply:
          "Percebi o evento, mas nao o consegui guardar na agenda. Tenta novamente.",
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: ""
      };
    }
  }

  if (options.executeCalendarAction && shouldDeleteCalendarEvents(finalInterpretation)) {
    calendarTrace.executed = true;
    const calendarStartedAt = Date.now();
    try {
      const calendarResult = await deleteCalendarEvents(finalInterpretation.extractedData);

      calendarTrace.success = true;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.result = calendarResult;
      finalInterpretation = {
        ...finalInterpretation,
        reply: calendarResult.reply ?? finalInterpretation.reply,
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: "",
        missingFields: []
      };
    } catch (error) {
      console.error("[orchestrator] Falha ao apagar evento na agenda:", error);
      calendarTrace.success = false;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.error =
        error instanceof Error ? error.message : "Falha desconhecida no calendar-service";
      shouldUpdatePending = false;
      if (options.persistState) {
        await clearPendingCommand(payload.channelId);
      }
      finalInterpretation = {
        ...finalInterpretation,
        reply:
          "Percebi o pedido, mas nao consegui apagar o evento na agenda. Tenta novamente.",
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: ""
      };
    }
  }

  if (options.executeCalendarAction && shouldUpdateCalendarEvents(finalInterpretation)) {
    calendarTrace.executed = true;
    const calendarStartedAt = Date.now();
    try {
      const calendarResult = await updateCalendarEvents(finalInterpretation.extractedData);

      calendarTrace.success = true;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.result = calendarResult;
      finalInterpretation = {
        ...finalInterpretation,
        reply: calendarResult.reply ?? finalInterpretation.reply,
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: "",
        missingFields: []
      };
    } catch (error) {
      console.error("[orchestrator] Falha ao atualizar evento na agenda:", error);
      calendarTrace.success = false;
      calendarDurationMs = Date.now() - calendarStartedAt;
      calendarTrace.durationMs = calendarDurationMs;
      calendarTrace.error =
        error instanceof Error ? error.message : "Falha desconhecida no calendar-service";
      shouldUpdatePending = false;
      if (options.persistState) {
        await clearPendingCommand(payload.channelId);
      }
      finalInterpretation = {
        ...finalInterpretation,
        reply:
          "Percebi o pedido, mas nao consegui atualizar o evento na agenda. Tenta novamente.",
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        followUpQuestion: ""
      };
    }
  }

  finalInterpretation = beautifyAssistantInterpretation(finalInterpretation);

  if (shouldUpdatePending && options.persistState) {
    await updatePendingCommand(payload, finalInterpretation);
  }

  if (options.persistConversation) {
    await appendConversationMessage(payload.channelId, {
      role: "user",
      content: payload.content,
      timestamp: payload.timestamp
    });

    await appendConversationMessage(payload.channelId, {
      role: "assistant",
      content: finalInterpretation.reply,
      timestamp: new Date().toISOString()
    });
  }

  const pendingAfter = options.persistState
    ? await getPendingCommandState(payload.channelId)
    : null;

  const processingTimings: MessageProcessingTimings = {
    totalMs: Date.now() - processingStartedAt,
    plannerMs: plannerResult.trace.timings?.totalMs,
    plannerNormalizationMs: plannerResult.trace.timings?.normalizationMs,
    plannerInterpretMs: plannerResult.trace.timings?.interpretMs,
    multiAgentMs: multiAgentTrace?.timings?.totalMs,
    multiAgentContextMs: multiAgentTrace?.timings?.contextMs,
    extractorMs: multiAgentTrace?.timings?.extractorMs,
    validatorMs: multiAgentTrace?.timings?.validatorMs,
    calendarMs: calendarDurationMs || undefined
  };

  if (env.timingLogs) {
    console.log(
      [
        `[orchestrator] Timings channel=${payload.channelId}`,
        `command=${finalInterpretation.command}`,
        `total=${processingTimings.totalMs}ms`,
        `planner=${processingTimings.plannerMs ?? 0}ms`,
        `planner_normalizer=${processingTimings.plannerNormalizationMs ?? 0}ms`,
        `planner_interpret=${processingTimings.plannerInterpretMs ?? 0}ms`,
        `multi_agent=${processingTimings.multiAgentMs ?? 0}ms`,
        `multi_context=${processingTimings.multiAgentContextMs ?? 0}ms`,
        `extractor=${processingTimings.extractorMs ?? 0}ms`,
        `validator=${processingTimings.validatorMs ?? 0}ms`,
        `calendar=${processingTimings.calendarMs ?? 0}ms`
      ].join(" | ")
    );
  }

  return {
    reply: finalInterpretation.reply,
    interpretation: finalInterpretation,
    trace: options.includeTrace
      ? {
          pendingBefore: pendingCommand,
          pendingReset: shouldResetPending,
          historyUsed: fullHistory,
          planner: {
            trace: plannerResult.trace,
            interpretation: plannerResult.interpretation
          },
          multiAgent: multiAgentTrace,
          normalizedInterpretation,
          finalInterpretation,
          pendingAfter,
          calendar: calendarTrace,
          timings: processingTimings
        }
      : undefined
  };
}

async function callLlmService(
  message: DiscordMessageInput,
  pendingCommand: PendingCommand | null,
  fullHistory: ConversationMessage[]
): Promise<LlmInterpretation> {
  const result = await callLlmServiceWithTrace(message, pendingCommand, fullHistory);
  return result.interpretation;
}

async function callLlmServiceWithTrace(
  message: DiscordMessageInput,
  pendingCommand: PendingCommand | null,
  fullHistory: ConversationMessage[]
): Promise<{
  interpretation: LlmInterpretation;
  trace: PlannerTrace;
}> {
  const plannerStartedAt = Date.now();
  // Quando existe um comando pendente, limitar o historico aos ultimos 4 turnos (2 user + 2 assistant)
  // para nao confundir o LLM com contexto anterior ao inicio do fluxo de marcacao.
  const history = pendingCommand ? fullHistory.slice(-4) : fullHistory;
  const now = getTimeContext(resolveReferenceTime(message.timestamp));
  const normalizationStartedAt = Date.now();
  const normalization = await callNormalizerService(message.content, now);
  const normalizationMs = Date.now() - normalizationStartedAt;
  let temporalHints = resolveTemporalHintsFromExpressions(
    normalization.temporalExpressions,
    now.currentDate
  );

  // Override: se a mensagem contem explicitamente um nome de dia da semana e nao ha expressao
  // de offset de semana (ex: "daqui a uma semana na quarta"), resolver o dia diretamente do
  // texto em vez de confiar no normalizador (que pode classificar "quinta" como "amanha", etc.)
  const hasWeekOffsetInExpressions =
    normalization.temporalExpressions.some(
      (e) => (e.kind === "relative_range" || e.kind === "relative_offset") && e.unit === "week"
    ) && normalization.temporalExpressions.some((e) => e.kind === "weekday");
  // Resolucao direta do dia da semana a partir do texto original (mais fiavel que o LLM)
  // Guardamos para poder sobrescrever a data do LLM mesmo que este devolva um valor incorreto
  // "proxima segunda" combina week-offset + weekday no normalizador, mas a funcao local trata-o
  // corretamente via hasNextWeekModifier â€” nao bloquear o hint nesse caso especifico.
  const hasProximaWeekday =
    /\bproxim[ao]\s+(?:\w+-feira\s+)?(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/u.test(
      message.content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    );
  // Data explicita no formato D/M ou D/M/YYYY (formato PT) â€” tem prioridade absoluta sobre o LLM
  const todayForDate = parseIsoDate(now.currentDate);
  const currentYear = todayForDate.getUTCFullYear();
  const explicitDateOverride =
    extractExplicitDateFromMessage(message.content, currentYear) ??
    extractWrittenDateFromMessage(message.content, currentYear) ??
    extractRelativeMonthDateFromMessage(message.content, todayForDate);
  const weekAnchorOverride = resolveRelativeWeekAnchorDateFromMessage(
    message.content,
    now.currentDate
  );
  const explicitDateRangeOverride = resolveDeterministicDateRangeFromMessage(
    message.content,
    now.currentDate
  );

  let directWeekdayHint: TemporalHint | null = null;
  if (!hasWeekOffsetInExpressions || hasProximaWeekday) {
    const today = parseIsoDate(now.currentDate);
    // Usar a mensagem original (nao o texto corrigido) para extrair o dia da semana:
    // o normalizador pode "corrigir" incorretamente "quinta" para "quarta", etc.
    directWeekdayHint = extractWeekdayHintFromMessage(message.content, today);
    if (directWeekdayHint) {
      // Remover qualquer hint que derive de uma expressao com nome de dia (pode estar mal classificada)
      const keptHints = temporalHints.filter((h) => !extractWeekdayFromText(h.expression));
      temporalHints = [...keptHints, directWeekdayHint];
    }
  }

  const interpretStartedAt = Date.now();
  const response = await fetch(`${env.llmServiceUrl.replace(/\/$/, "")}/interpret`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message: {
        ...message,
        content: normalization.correctedText
      },
      history,
      pendingCommand,
      context: {
        app: "AI Personal Calendar Agent",
        assistantName: "Pulse",
        channelType: "discord-dm",
        allowedCommands,
        responseLanguage: "auto",
        outputSchemaVersion: "1.0",
        currentDateTime: now.currentDateTime,
        currentDate: now.currentDate,
        currentTime: now.currentTime,
        timezone: env.timezone,
        temporalHints,
        normalization
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `LLM Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    interpretation?: LlmInterpretation;
  };

  if (!body.interpretation) {
    throw new Error("LLM Service nao devolveu 'interpretation'.");
  }

  const interpretMs = Date.now() - interpretStartedAt;
  const interpretation = body.interpretation;

  // Safety net: se o LLM nao extraiu date mas temos um hint com data resolvida, injetamos.
  // Cobre todos os tipos: "date" (amanha, hoje), "weekday" (segunda, quarta), "range" nao e injetado.
  if (
    interpretation.command === "create_event" &&
    !hasNonEmptyValue(interpretation.extractedData?.date)
  ) {
    const dateHint = temporalHints.find(
      (h) => (h.type === "date" || h.type === "weekday") && h.date
    );
    if (dateHint?.date) {
      interpretation.extractedData = { ...interpretation.extractedData };
      interpretation.extractedData.date = dateHint.date;
      interpretation.extractedData.rawDate = dateHint.expression;
      interpretation.missingFields = (interpretation.missingFields ?? []).filter(
        (f) => f !== "date" && f !== "rawDate"
      );
    }
  }

  if (
    interpretation.command === "create_event" &&
    !hasNonEmptyValue(interpretation.extractedData?.date) &&
    weekAnchorOverride
  ) {
    interpretation.extractedData = {
      ...interpretation.extractedData,
      date: weekAnchorOverride.date,
      rawDate: weekAnchorOverride.raw
    };
    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => f !== "date" && f !== "rawDate"
    );
  }

  // Override: se a mensagem tem um dia da semana resolvido localmente, usar SEMPRE essa data.
  // O LLM pode copiar a data de um evento anterior no historico em vez de usar o dia correto.
  if (interpretation.command === "create_event" && directWeekdayHint?.date) {
    interpretation.extractedData = { ...interpretation.extractedData };
    interpretation.extractedData.date = directWeekdayHint.date;
    interpretation.extractedData.rawDate = directWeekdayHint.expression;
    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => f !== "date" && f !== "rawDate"
    );
  }

  // Override: data explicita D/M ou D/M/YYYY no texto â†’ maximo de prioridade (LLM confunde formatos)
  if (interpretation.command === "create_event" && explicitDateOverride) {
    interpretation.extractedData = { ...interpretation.extractedData };
    interpretation.extractedData.date = explicitDateOverride.date;
    interpretation.extractedData.rawDate = explicitDateOverride.raw;
    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => f !== "date" && f !== "rawDate"
    );
  }

  if (interpretation.command === "create_event" && explicitDateRangeOverride) {
    interpretation.extractedData = {
      ...interpretation.extractedData,
      date: explicitDateRangeOverride.startDate,
      endDate: explicitDateRangeOverride.endDate,
      rawDate: explicitDateRangeOverride.raw,
      allDay: true
    };
    delete interpretation.extractedData.time;
    delete interpretation.extractedData.rawTime;
    delete interpretation.extractedData.startTime;
    delete interpretation.extractedData.endTime;
    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => !["date", "rawDate", "time", "startTime", "endTime"].includes(f)
    );
  }

  // Override: "hoje"/"amanha"/"ontem" no texto â†’ injetar data correta SEMPRE (LLM erra frequentemente).
  // So aplicar em fluxo inicial (sem pendingCommand) para nao sobrescrever datas de turnos anteriores.
  if (interpretation.command === "create_event" && !pendingCommand) {
    const msgNorm = message.content
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const todayDate = parseIsoDate(now.currentDate);
    if (/\bhoje\b/u.test(msgNorm)) {
      interpretation.extractedData = { ...interpretation.extractedData, date: now.currentDate, rawDate: "hoje" };
      interpretation.missingFields = (interpretation.missingFields ?? []).filter((f) => f !== "date" && f !== "rawDate");
    } else if (/\bdepois\s+de\s+amanha\b/u.test(msgNorm)) {
      interpretation.extractedData = { ...interpretation.extractedData, date: formatIsoDate(addDays(todayDate, 2)), rawDate: "depois de amanha" };
      interpretation.missingFields = (interpretation.missingFields ?? []).filter((f) => f !== "date" && f !== "rawDate");
    } else if (/\bamanha\b/u.test(msgNorm)) {
      interpretation.extractedData = { ...interpretation.extractedData, date: formatIsoDate(addDays(todayDate, 1)), rawDate: "amanha" };
      interpretation.missingFields = (interpretation.missingFields ?? []).filter((f) => f !== "date" && f !== "rawDate");
    } else if (/\bontem\b/u.test(msgNorm)) {
      interpretation.extractedData = { ...interpretation.extractedData, date: formatIsoDate(addDays(todayDate, -1)), rawDate: "ontem" };
      interpretation.missingFields = (interpretation.missingFields ?? []).filter((f) => f !== "date" && f !== "rawDate");
    }
  }

  // Rejeitar data inventada pelo LLM quando nenhum sinal temporal local foi encontrado na mensagem.
  // Sem pendingCommand = primeiro turno. Se ha pendingCommand, a data do turno anterior ja foi validada
  // e sera preservada por mergeExtractedData â€” nao precisamos de apagar aqui.
  if (
    interpretation.command === "create_event" &&
    !pendingCommand &&
    hasNonEmptyValue(interpretation.extractedData?.date)
  ) {
    const hasLocalDateSignal =
      Boolean(explicitDateOverride) ||
      Boolean(explicitDateRangeOverride) ||
      Boolean(directWeekdayHint) ||
      messageHasDateAnchor(message.content);
    if (!hasLocalDateSignal) {
      interpretation.extractedData = { ...interpretation.extractedData };
      delete interpretation.extractedData.date;
      delete interpretation.extractedData.rawDate;
    }
  }

  // Safety net: se o LLM nao extraiu title mas o pendingCommand pedia title e a mensagem e curta â†’ usar mensagem como title
  // Nao aplicar se a mensagem contem hora (pode ser resposta combinada "Nome ate as 18:30")
  if (
    interpretation.command === "create_event" &&
    pendingCommand?.missingFields?.includes("title") &&
    !hasNonEmptyValue(interpretation.extractedData?.title)
  ) {
    const trimmedContent = message.content.trim();
    const titleTimeData = extractTimeData(trimmedContent);
    if (!isSkipPhrase(trimmedContent) && !titleTimeData.startTime && !titleTimeData.endTime && trimmedContent.split(/\s+/).length <= 8) {
      interpretation.extractedData = { ...interpretation.extractedData };
      interpretation.extractedData.title = trimmedContent;
      interpretation.missingFields = (interpretation.missingFields ?? []).filter(
        (f) => f !== "title"
      );
    }
  }

  // Safety net: se o pendingCommand pedia endTime (ou startTime/time) e a mensagem e apenas
  // um numero de hora (ex: "21"), interpretar como hora inteira
  if (
    (interpretation.command === "create_event" || pendingCommand?.command === "create_event") &&
    pendingCommand?.missingFields?.some((f) => f === "endTime" || f === "startTime" || f === "time") &&
    (
      (pendingCommand?.missingFields?.includes("endTime") &&
        !hasNonEmptyValue(interpretation.extractedData?.endTime)) ||
      ((pendingCommand?.missingFields?.includes("startTime") ||
        pendingCommand?.missingFields?.includes("time")) &&
        !hasNonEmptyValue(interpretation.extractedData?.startTime))
    )
  ) {
    const trimmedContent = message.content.trim();
    const parsedShortTime = isLikelyStandaloneTimeReply(trimmedContent)
      ? parseShortTimeReply(trimmedContent)
      : null;
    if (parsedShortTime) {
      interpretation.command = "create_event";
      interpretation.hasCommand = true;
      if (pendingCommand?.missingFields?.includes("endTime")) {
        interpretation.extractedData = {
          ...interpretation.extractedData,
          endTime: parsedShortTime,
          rawTime: trimmedContent
        };
        interpretation.missingFields = (interpretation.missingFields ?? []).filter(
          (f) => f !== "endTime" && f !== "time"
        );
      } else {
        interpretation.extractedData = {
          ...interpretation.extractedData,
          startTime: parsedShortTime,
          rawTime: trimmedContent
        };
        interpretation.missingFields = (interpretation.missingFields ?? []).filter(
          (f) => f !== "startTime" && f !== "time"
        );
      }
    }
  }

  if (
    (interpretation.command === "create_event" || pendingCommand?.command === "create_event") &&
    pendingCommand?.missingFields?.some((f) => f === "startTime" || f === "endTime" || f === "time") &&
    isAllDayPhrase(message.content)
  ) {
    interpretation.command = "create_event";
    interpretation.hasCommand = true;
    interpretation.extractedData = {
      ...interpretation.extractedData,
      ...pendingCommand?.extractedData,
      allDay: true
    };
    delete interpretation.extractedData.startTime;
    delete interpretation.extractedData.endTime;
    delete interpretation.extractedData.time;
    delete interpretation.extractedData.rawTime;
    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => f !== "startTime" && f !== "endTime" && f !== "time"
    );
  }

  // Safety net: confirmacao do titulo inferido
  // O LLM pode classificar a resposta como 'chat' quando o utilizador confirma/renomeia o titulo
  if (
    (interpretation.command === "create_event" || pendingCommand?.command === "create_event") &&
    pendingCommand?.missingFields?.includes("titleConfirmation")
  ) {
    const trimmedContent = message.content.trim();
    interpretation.command = "create_event";
    interpretation.hasCommand = true;

    if (!isAffirmativePhrase(trimmedContent) && !isSkipPhrase(trimmedContent)) {
      // Utilizador deu um nome alternativo â†’ usar como titulo (remover preambles comuns)
      const newTitle = trimmedContent
        .replace(
          /^(?:muda\s+para|prefiro|chama.se|que\s+se\s+chame|nome|titulo|e\s+melhor|sim\s+mas|quero\s+antes)\s+/iu,
          ""
        )
        .trim();
      if (newTitle) {
        interpretation.extractedData = {
          ...interpretation.extractedData,
          title: normalizeSentenceCase(newTitle),
          __titleInferred: undefined
        };
        delete (interpretation.extractedData as Record<string, unknown>).__titleInferred;
      }
    } else {
      // Afirmativo ou skip â†’ manter titulo actual, limpar flag
      const ed = { ...interpretation.extractedData } as Record<string, unknown>;
      delete ed.__titleInferred;
      interpretation.extractedData = ed;
    }

    interpretation.missingFields = (interpretation.missingFields ?? []).filter(
      (f) => f !== "titleConfirmation"
    );
  }

  // Safety net: se o LLM nao extraiu description mas o pendingCommand pedia description â†’ usar mensagem como description
  // (cobre casos como "Vou trabalhar em Multi Agents" onde nao ha "sobre"/"para" para inferir)
  // Nao aplicar se a mensagem e temporal ou contem hora
  // NOTA: usar tambem pendingCommand?.command para cobrir casos em que o LLM classifica "Salta" como 'chat'
  if (
    (interpretation.command === "create_event" || pendingCommand?.command === "create_event") &&
    pendingCommand?.missingFields?.includes("description") &&
    !hasNonEmptyValue(interpretation.extractedData?.description)
  ) {
    const trimmedContent = message.content.trim();
    const descTimeData = extractTimeData(trimmedContent);
    if (isDescriptionSkipReply(trimmedContent)) {
      // Utilizador quer saltar a descricao â€” restaurar comando e marcar como saltada
      interpretation.command = "create_event";
      interpretation.hasCommand = true;
      interpretation.extractedData = { ...interpretation.extractedData, __descriptionSkipped: true };
      interpretation.missingFields = (interpretation.missingFields ?? []).filter(
        (f) => f !== "description"
      );
    } else if (
      !looksLikeTemporalOnly(trimmedContent) &&
      !descTimeData.startTime &&
      !descTimeData.endTime
    ) {
      // Restaurar comando se o LLM classificou como 'chat' (ex: "Sim levar a prenda de anos")
      interpretation.command = "create_event";
      interpretation.hasCommand = true;
      // Remover prefixo afirmativo ("Sim", "Ok", "Claro", ...) antes de guardar como descriÃ§Ã£o
      const descContent = trimmedContent.replace(
        /^(?:sim|ok|okay|claro|certo|ah\s+sim|ah\s+ok|pode|pode\s+ser)\s+/iu,
        ""
      ).trim();
      interpretation.extractedData = { ...interpretation.extractedData };
      interpretation.extractedData.description = normalizeSentenceCase(
        stripDescriptionPreamble(descContent || trimmedContent)
      );
      interpretation.missingFields = (interpretation.missingFields ?? []).filter(
        (f) => f !== "description"
      );
    }
  }

  return {
    interpretation,
    trace: {
      currentDateTime: now.currentDateTime,
      currentDate: now.currentDate,
      currentTime: now.currentTime,
      normalization,
      temporalHints,
      timings: {
        normalizationMs,
        interpretMs,
        totalMs: Date.now() - plannerStartedAt
      }
    }
  };
}

function shouldResetPendingForFreshCreateEvent(
  messageContent: string,
  pendingCommand: PendingCommand | null
): boolean {
  if (!pendingCommand) {
    return false;
  }

  const normalized = normalizeLooseText(messageContent);
  const startsFreshCreateFlow = looksLikeCreateEventIntent(normalized);

  if (!startsFreshCreateFlow) {
    return false;
  }

  if (pendingCommand.command !== "create_event") {
    return true;
  }

  const timeData = extractTimeData(normalized);
  const shortTimeReply = parseShortTimeReply(normalized);
  const onlyLikelyAnswerToPending =
    pendingCommand.missingFields.includes("description")
      ? !looksLikeTemporalOnly(normalized) &&
        !timeData.startTime &&
        !timeData.endTime
      : pendingCommand.missingFields.includes("endTime")
        ? Boolean(shortTimeReply || timeData.endTime)
        : pendingCommand.missingFields.includes("startTime") ||
            pendingCommand.missingFields.includes("time")
          ? Boolean(shortTimeReply || timeData.startTime)
          : false;

  return !onlyLikelyAnswerToPending;
}

function shouldResetPendingForFreshUpdateEvent(
  messageContent: string,
  pendingCommand: PendingCommand | null
): boolean {
  if (!pendingCommand) {
    return false;
  }

  const startsFreshUpdateFlow = looksLikeUpdateEventIntent(messageContent);
  if (!startsFreshUpdateFlow) {
    return false;
  }

  return true;
}

function shouldUseCreateEventMultiAgent(
  planner: LlmInterpretation,
  pendingCommand: PendingCommand | null,
  messageContent: string
): boolean {
  return (
    planner.command === "create_event" ||
    pendingCommand?.command === "create_event" ||
    detectCreateEventIntent(messageContent)
  );
}

async function buildCreateEventInterpretationWithAgents(
  message: DiscordMessageInput,
  pendingCommand: PendingCommand | null,
  history: ConversationMessage[],
  planner: LlmInterpretation
): Promise<LlmInterpretation> {
  const result = await buildCreateEventInterpretationWithAgentsDetailed(
    message,
    pendingCommand,
    history,
    planner
  );

  return result.interpretation;
}

async function buildCreateEventInterpretationWithAgentsDetailed(
  message: DiscordMessageInput,
  pendingCommand: PendingCommand | null,
  history: ConversationMessage[],
  planner: LlmInterpretation
): Promise<{
  interpretation: LlmInterpretation;
  context: MultiAgentContext;
  extraction: ExtractionResult;
  validation: ValidationResult;
  timings: MultiAgentTimings;
}> {
  const multiAgentStartedAt = Date.now();
  const contextStartedAt = Date.now();
  const agentContext = await buildMultiAgentContext(message);
  const contextMs = Date.now() - contextStartedAt;
  const extractionStartedAt = Date.now();
  const extraction = await callExtractorService(
    message,
    history,
    pendingCommand,
    planner,
    agentContext
  );
  const extractorMs = Date.now() - extractionStartedAt;
  const validationStartedAt = Date.now();
  const validation = await callValidatorService(
    message,
    history,
    pendingCommand,
    planner,
    extraction,
    agentContext
  );
  const validatorMs = Date.now() - validationStartedAt;
  const seededAgentResult = seedAgentInterpretationFromPlanner(
    planner,
    pendingCommand,
    extraction.extractedData,
    validation.extractedData,
    validation.missingFields,
    agentContext.normalization.correctedText.trim() || message.content
  );
  const deterministicDateOverride = resolveDeterministicDateFromMessage(
    message.content,
    agentContext.currentDate
  );
  const deterministicDateRangeOverride = resolveDeterministicDateRangeFromMessage(
    message.content,
    agentContext.currentDate
  );

  if (deterministicDateRangeOverride) {
    seededAgentResult.extractedData = {
      ...seededAgentResult.extractedData,
      date: deterministicDateRangeOverride.startDate,
      endDate: deterministicDateRangeOverride.endDate,
      rawDate: deterministicDateRangeOverride.raw,
      allDay: true
    };
    delete seededAgentResult.extractedData.time;
    delete seededAgentResult.extractedData.rawTime;
    delete seededAgentResult.extractedData.startTime;
    delete seededAgentResult.extractedData.endTime;
    seededAgentResult.missingFields = seededAgentResult.missingFields.filter(
      (field) => !["date", "rawDate", "time", "startTime", "endTime"].includes(field)
    );
  }

  if (deterministicDateOverride && !deterministicDateRangeOverride) {
    seededAgentResult.extractedData = {
      ...seededAgentResult.extractedData,
      date: deterministicDateOverride.date,
      rawDate: deterministicDateOverride.raw
    };
    seededAgentResult.missingFields = seededAgentResult.missingFields.filter(
      (field) => field !== "date" && field !== "rawDate"
    );
  }

  const interpretation: LlmInterpretation = {
    command: validation.command,
    hasCommand: planner.hasCommand || validation.command !== "unknown",
    confidence: Math.max(
      planner.confidence,
      Math.min(extraction.confidence, validation.confidence)
    ),
    isComplete: false,
    reply: validation.shouldAskFollowUp
      ? validation.followUpQuestion
      : planner.reply,
    extractedData: seededAgentResult.extractedData,
    fieldEvidence: validation.fieldEvidence,
    needsCalendarAction: false,
    shouldAskFollowUp: validation.shouldAskFollowUp,
    missingFields: seededAgentResult.missingFields,
    followUpQuestion: validation.followUpQuestion,
    notes: [planner.notes, extraction.notes, validation.notes]
      .map((note) => note.trim())
      .filter((note) => note.length > 0)
      .join(" | ")
  };

  return {
    interpretation,
    context: agentContext,
    extraction,
    validation,
    timings: {
      contextMs,
      extractorMs,
      validatorMs,
      totalMs: Date.now() - multiAgentStartedAt
    }
  };
}

function seedAgentInterpretationFromPlanner(
  planner: LlmInterpretation,
  pendingCommand: PendingCommand | null,
  extractionData: Record<string, unknown>,
  extractedData: Record<string, unknown>,
  missingFields: string[],
  messageContent: string
): {
  extractedData: Record<string, unknown>;
  missingFields: string[];
} {
  const seeded = { ...extractedData };
  const missing = new Set(missingFields);
  const plannerData = planner.extractedData ?? {};
  const extractionTitle =
    typeof extractionData.title === "string" ? normalizeSentenceCase(extractionData.title) : null;
  const safeExtractionTitle =
    extractionTitle &&
    titleHasSupportInMessage(extractionTitle, messageContent) &&
    !isSuspiciousFreshEventTitle(extractionTitle, messageContent)
      ? extractionTitle
      : null;
  const extractionDate = normalizeDateValue(extractionData.date);
  const extractionEndDate = normalizeDateValue(extractionData.endDate);
  const extractionAllDay = extractionData.allDay === true;
  const extractionStartTime =
    normalizeClockTimeValue(extractionData.startTime) ??
    normalizeClockTimeValue(extractionData.time);
  const extractionEndTime = normalizeClockTimeValue(extractionData.endTime);
  const extractionDescription =
    typeof extractionData.description === "string" && extractionData.description.trim().length > 0
      ? normalizeSentenceCase(extractionData.description)
      : null;
  const extractionCategory =
    typeof extractionData.category === "string" && extractionData.category.trim().length > 0
      ? normalizeExplicitCategoryValue(extractionData.category)
      : null;

  const plannerTitle =
    typeof plannerData.title === "string" ? normalizeSentenceCase(plannerData.title) : null;
  const safePlannerTitle =
    plannerTitle &&
    titleHasSupportInMessage(plannerTitle, messageContent) &&
    !isSuspiciousFreshEventTitle(plannerTitle, messageContent)
      ? plannerTitle
      : null;
  const plannerDate = normalizeDateValue(plannerData.date);
  const plannerEndDate = normalizeDateValue(plannerData.endDate);
  const plannerCategory =
    typeof plannerData.category === "string" && plannerData.category.trim().length > 0
      ? normalizeExplicitCategoryValue(plannerData.category)
      : null;
  const plannerAllDay = plannerData.allDay === true;
  const plannerHasAllDayRange =
    Boolean(plannerDate) &&
    Boolean(plannerEndDate) &&
    plannerAllDay &&
    !normalizeClockTimeValue(plannerData.startTime) &&
    !normalizeClockTimeValue(plannerData.time) &&
    !normalizeClockTimeValue(plannerData.endTime);
  const plannerHasAllDayDate =
    Boolean(plannerDate) &&
    plannerAllDay &&
    !plannerEndDate &&
    !normalizeClockTimeValue(plannerData.startTime) &&
    !normalizeClockTimeValue(plannerData.time) &&
    !normalizeClockTimeValue(plannerData.endTime);
  const extractionHasAllDayRange =
    Boolean(extractionDate) &&
    Boolean(extractionEndDate) &&
    extractionAllDay &&
    !extractionStartTime &&
    !extractionEndTime;
  const extractionHasAllDayDate =
    Boolean(extractionDate) &&
    extractionAllDay &&
    !extractionEndDate &&
    !extractionStartTime &&
    !extractionEndTime;

  if (!hasNonEmptyValue(seeded.title) && safePlannerTitle) {
    seeded.title = safePlannerTitle;
    missing.delete("title");
    missing.delete("titleConfirmation");
  }
  if (!hasNonEmptyValue(seeded.title) && safeExtractionTitle) {
    seeded.title = safeExtractionTitle;
    missing.delete("title");
    missing.delete("titleConfirmation");
  }

  if (!hasNonEmptyValue(seeded.title)) {
    const canonicalTitle = extractionCategory ?? plannerCategory;
    if (canonicalTitle && (plannerTitle || extractionTitle || extractionCategory || plannerCategory)) {
      seeded.title = canonicalTitle;
      missing.delete("title");
      missing.delete("titleConfirmation");
    }
  }

  const canonicalTitle = extractionCategory ?? plannerCategory;
  const currentSeededTitle =
    typeof seeded.title === "string" && seeded.title.trim().length > 0 ? seeded.title : null;
  if (
    canonicalTitle &&
    currentSeededTitle &&
    !titleHasSupportInMessage(currentSeededTitle, messageContent) &&
    !isSuspiciousFreshEventTitle(canonicalTitle, messageContent)
  ) {
    const seededTitleCategory = inferControlledCategoryFromText(currentSeededTitle);
    const isSingleWordTitle = currentSeededTitle.trim().split(/\s+/u).length === 1;
    if (!seededTitleCategory || isSingleWordTitle) {
      seeded.title = canonicalTitle;
      missing.delete("title");
      missing.delete("titleConfirmation");
    }
  }

  if (plannerHasAllDayRange && plannerDate && plannerEndDate) {
    seeded.date = plannerDate;
    seeded.endDate = plannerEndDate;
    seeded.allDay = true;
    delete seeded.time;
    delete seeded.rawTime;
    delete seeded.startTime;
    delete seeded.endTime;
    missing.delete("date");
    missing.delete("rawDate");
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  } else if (
    !hasNonEmptyValue(seeded.date) &&
    extractionHasAllDayRange &&
    extractionDate &&
    extractionEndDate
  ) {
    seeded.date = extractionDate;
    seeded.endDate = extractionEndDate;
    seeded.allDay = true;
    delete seeded.time;
    delete seeded.rawTime;
    delete seeded.startTime;
    delete seeded.endTime;
    if (
      hasNonEmptyValue(extractionData.rawDate) &&
      !hasNonEmptyValue(seeded.rawDate)
    ) {
      seeded.rawDate = extractionData.rawDate;
    }
    missing.delete("date");
    missing.delete("rawDate");
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  }

  if (plannerHasAllDayDate && plannerDate) {
    seeded.date = plannerDate;
    seeded.allDay = true;
    delete seeded.endDate;
    delete seeded.time;
    delete seeded.rawTime;
    delete seeded.startTime;
    delete seeded.endTime;
    if (hasNonEmptyValue(plannerData.rawDate) && !hasNonEmptyValue(seeded.rawDate)) {
      seeded.rawDate = plannerData.rawDate;
    }
    missing.delete("date");
    missing.delete("rawDate");
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  } else if (extractionHasAllDayDate && extractionDate) {
    seeded.date = extractionDate;
    seeded.allDay = true;
    delete seeded.endDate;
    delete seeded.time;
    delete seeded.rawTime;
    delete seeded.startTime;
    delete seeded.endTime;
    if (
      hasNonEmptyValue(extractionData.rawDate) &&
      !hasNonEmptyValue(seeded.rawDate)
    ) {
      seeded.rawDate = extractionData.rawDate;
    }
    missing.delete("date");
    missing.delete("rawDate");
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  }

  if (!hasNonEmptyValue(seeded.date) && hasNonEmptyValue(plannerDate)) {
    seeded.date = plannerDate;
    if (hasNonEmptyValue(plannerData.rawDate) && !hasNonEmptyValue(seeded.rawDate)) {
      seeded.rawDate = plannerData.rawDate;
    }
    missing.delete("date");
    missing.delete("rawDate");
  }
  if (!hasNonEmptyValue(seeded.date) && extractionDate) {
    seeded.date = extractionDate;
    if (
      hasNonEmptyValue(extractionData.rawDate) &&
      !hasNonEmptyValue(seeded.rawDate)
    ) {
      seeded.rawDate = extractionData.rawDate;
    }
    missing.delete("date");
    missing.delete("rawDate");
  }

  if (!hasNonEmptyValue(seeded.startTime)) {
    const plannerStartTime =
      normalizeClockTimeValue(plannerData.startTime) ??
      normalizeClockTimeValue(plannerData.time);
    if (plannerStartTime) {
      seeded.startTime = plannerStartTime;
      if (!hasNonEmptyValue(seeded.time)) {
        seeded.time = plannerStartTime;
      }
      if (hasNonEmptyValue(plannerData.rawTime) && !hasNonEmptyValue(seeded.rawTime)) {
        seeded.rawTime = plannerData.rawTime;
      }
      missing.delete("startTime");
      missing.delete("time");
    }
  }
  if (!hasNonEmptyValue(seeded.startTime) && extractionStartTime) {
    seeded.startTime = extractionStartTime;
    if (!hasNonEmptyValue(seeded.time)) {
      seeded.time = extractionStartTime;
    }
    if (
      hasNonEmptyValue(extractionData.rawTime) &&
      !hasNonEmptyValue(seeded.rawTime)
    ) {
      seeded.rawTime = extractionData.rawTime;
    }
    missing.delete("startTime");
    missing.delete("time");
  }

  if (!hasNonEmptyValue(seeded.endTime)) {
    const plannerEndTime = normalizeClockTimeValue(plannerData.endTime);
    if (plannerEndTime) {
      seeded.endTime = plannerEndTime;
      if (hasNonEmptyValue(plannerData.rawTime) && !hasNonEmptyValue(seeded.rawTime)) {
        seeded.rawTime = plannerData.rawTime;
      }
      missing.delete("endTime");
    }
  }
  if (!hasNonEmptyValue(seeded.endTime) && extractionEndTime) {
    seeded.endTime = extractionEndTime;
    if (
      hasNonEmptyValue(extractionData.rawTime) &&
      !hasNonEmptyValue(seeded.rawTime)
    ) {
      seeded.rawTime = extractionData.rawTime;
    }
    missing.delete("endTime");
  }

  if (!hasNonEmptyValue(seeded.category) && hasNonEmptyValue(plannerData.category)) {
    seeded.category =
      typeof plannerData.category === "string"
        ? normalizeExplicitCategoryValue(plannerData.category) ?? plannerData.category
        : plannerData.category;
    missing.delete("category");
  }
  if (!hasNonEmptyValue(seeded.category) && extractionCategory) {
    seeded.category = extractionCategory;
    missing.delete("category");
  }
  if (
    !hasNonEmptyValue(seeded.description) &&
    extractionDescription &&
    !isSuspiciousDescriptionCandidate(extractionDescription, messageContent) &&
    !isDescriptionEquivalentToTitle(
      extractionDescription,
      typeof seeded.title === "string" ? seeded.title : null
    ) &&
    (!pendingCommand || pendingCommand.missingFields.includes("description"))
  ) {
    seeded.description = extractionDescription;
    missing.delete("description");
  }

  const derivedCategory = deriveEventCategory(seeded);
  if (derivedCategory) {
    seeded.category = derivedCategory;
    missing.delete("category");
  }

  return {
    extractedData: seeded,
    missingFields: Array.from(missing)
  };
}

async function buildMultiAgentContext(message: DiscordMessageInput): Promise<MultiAgentContext> {
  const now = getTimeContext(resolveReferenceTime(message.timestamp));
  const normalization = await callNormalizerService(message.content, now);
  const temporalHints = resolveTemporalHintsFromExpressions(
    normalization.temporalExpressions,
    now.currentDate
  );

  return {
    app: "AI Personal Calendar Agent",
    assistantName: "Pulse",
    channelType: "discord-dm",
    allowedCommands,
    responseLanguage: "auto",
    outputSchemaVersion: "1.0",
    currentDateTime: now.currentDateTime,
    currentDate: now.currentDate,
    currentTime: now.currentTime,
    timezone: env.timezone,
    temporalHints,
    normalization
  };
}

async function callExtractorService(
  message: DiscordMessageInput,
  history: ConversationMessage[],
  pendingCommand: PendingCommand | null,
  planner: LlmInterpretation,
  context: Awaited<ReturnType<typeof buildMultiAgentContext>>
): Promise<ExtractionResult> {
  const response = await fetch(`${env.extractorServiceUrl.replace(/\/$/, "")}/extract`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      plan: {
        command: planner.command,
        confidence: planner.confidence
      },
      message,
      history,
      pendingCommand,
      context
    })
  });

  if (!response.ok) {
    throw new Error(
      `Extractor Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    extraction?: ExtractionResult;
  };

  if (!body.extraction) {
    throw new Error("Extractor Service nao devolveu 'extraction'.");
  }

  return body.extraction;
}

async function callValidatorService(
  message: DiscordMessageInput,
  history: ConversationMessage[],
  pendingCommand: PendingCommand | null,
  planner: LlmInterpretation,
  extraction: ExtractionResult,
  context: Awaited<ReturnType<typeof buildMultiAgentContext>>
): Promise<ValidationResult> {
  const response = await fetch(`${env.validatorServiceUrl.replace(/\/$/, "")}/validate`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      plan: {
        command: planner.command,
        confidence: planner.confidence
      },
      extraction,
      message,
      history,
      pendingCommand,
      context: {
        currentDate: context.currentDate,
        currentTime: context.currentTime,
        timezone: context.timezone,
        normalization: context.normalization
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Validator Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    validation?: ValidationResult;
  };

  if (!body.validation) {
    throw new Error("Validator Service nao devolveu 'validation'.");
  }

  return body.validation;
}

async function callNormalizerService(
  text: string,
  now: ReturnType<typeof getTimeContext>
): Promise<NormalizationResult> {
  try {
    const response = await fetch(
      `${env.normalizerServiceUrl.replace(/\/$/, "")}/normalize`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          text,
          context: {
            currentDateTime: now.currentDateTime,
            currentDate: now.currentDate,
            currentTime: now.currentTime,
            timezone: env.timezone
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Normalizer Service respondeu com ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as NormalizationResult;
  } catch (error) {
    console.warn("[orchestrator] Normalizer indisponivel, a usar fallback local.", error);
    return {
      originalText: text,
      correctedText: text,
      normalizedText: text.trim(),
      temporalExpressions: [],
      notes: ["fallback: local orchestrator normalization"]
    };
  }
}

function shouldCreateCalendarEvent(interpretation: LlmInterpretation): boolean {
  const hasTimedSchedule =
    hasNonEmptyValue(interpretation.extractedData?.startTime) &&
    hasNonEmptyValue(interpretation.extractedData?.endTime);
  const hasAllDaySchedule =
    interpretation.extractedData?.allDay === true ||
    hasNonEmptyValue(interpretation.extractedData?.endDate);

  return (
    interpretation.command === "create_event" &&
    interpretation.needsCalendarAction &&
    hasNonEmptyValue(interpretation.extractedData?.title) &&
    hasNonEmptyValue(interpretation.extractedData?.date) &&
    (hasTimedSchedule || hasAllDaySchedule)
  );
}

function shouldDeleteCalendarEvents(interpretation: LlmInterpretation): boolean {
  const selectedPageIds = Array.isArray(interpretation.extractedData?.selectedPageIds)
    ? interpretation.extractedData.selectedPageIds
    : [];

  return (
    interpretation.command === "delete_event" &&
    interpretation.needsCalendarAction &&
    selectedPageIds.some((pageId) => typeof pageId === "string" && pageId.trim().length > 0)
  );
}

function shouldUpdateCalendarEvents(interpretation: LlmInterpretation): boolean {
  const updateItems = getCalendarUpdateItems(interpretation.extractedData.updateItems);
  return (
    interpretation.command === "update_event" &&
    interpretation.needsCalendarAction &&
    updateItems.length > 0
  );
}

async function createCalendarEvent(
  message: DiscordMessageInput,
  extractedData: Record<string, unknown>
): Promise<CalendarCreateEventResponse> {
  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "create_event",
      event: {
        title: String(extractedData.title ?? ""),
        date: String(extractedData.date ?? ""),
        ...(typeof extractedData.endDate === "string"
          ? { endDate: extractedData.endDate }
          : {}),
        ...(extractedData.allDay === true ? { allDay: true } : {}),
        ...(typeof extractedData.startTime === "string"
          ? { startTime: extractedData.startTime }
          : {}),
        ...(typeof extractedData.endTime === "string"
          ? { endTime: extractedData.endTime }
          : {}),
        description:
          typeof extractedData.description === "string"
            ? extractedData.description
            : undefined,
        category:
          typeof extractedData.category === "string"
            ? extractedData.category
            : undefined,
        rawDate:
          typeof extractedData.rawDate === "string" ? extractedData.rawDate : undefined
      },
      source: {
        source: message.source,
        channelId: message.channelId,
        userId: message.userId,
        username: message.username,
        messageId: message.messageId,
        timezone: env.timezone
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Calendar Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as CalendarCreateEventResponse;
}

function shouldCreateCalendarBatch(interpretation: LlmInterpretation): boolean {
  const createItems = getCreateDraftArray(interpretation.extractedData.createItems);
  return (
    interpretation.command === "create_event" &&
    interpretation.needsCalendarAction &&
    createItems.length > 0
  );
}

async function createCalendarBatch(
  message: DiscordMessageInput,
  extractedData: Record<string, unknown>
): Promise<{
  reply: string;
  createdCount: number;
  firstResult?: CalendarCreateEventResponse;
}> {
  const createItems = getCreateDraftArray(extractedData.createItems);
  if (createItems.length === 0) {
    throw new Error("Nao existem eventos para criar em batch.");
  }

  const results: CalendarCreateEventResponse[] = [];

  for (const item of createItems) {
    const result = await createCalendarEvent(message, item as unknown as Record<string, unknown>);
    results.push(result);
  }

  return {
    reply: buildBatchCreateSuccessReply(extractedData, createItems, results.length),
    createdCount: results.length,
    firstResult: results[0]
  };
}

async function searchCalendarEvents(
  message: DiscordMessageInput,
  filters: CalendarSearchFilters,
  options: MessageProcessingOptions
): Promise<CalendarEventSummary[]> {
  if (options.mockCalendarSearchResults) {
    return filterCalendarSearchResults(options.mockCalendarSearchResults, {
      ...filters,
      userId: message.userId
    });
  }

  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/events/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "search_events",
      filters: {
        ...filters,
        userId: message.userId
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Calendar Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as CalendarSearchEventsResponse;
  return Array.isArray(body.events) ? body.events : [];
}

async function deleteCalendarEvents(
  extractedData: Record<string, unknown>
): Promise<CalendarDeleteEventsResponse> {
  const pageIds = Array.isArray(extractedData.selectedPageIds)
    ? extractedData.selectedPageIds.filter(
        (pageId): pageId is string => typeof pageId === "string" && pageId.trim().length > 0
      )
    : [];

  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/events/delete`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "delete_events",
      pageIds
    })
  });

  if (!response.ok) {
    throw new Error(
      `Calendar Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as CalendarDeleteEventsResponse;
}

async function updateCalendarEvents(
  extractedData: Record<string, unknown>
): Promise<CalendarUpdateEventsResponse> {
  const updateItems = getCalendarUpdateItems(extractedData.updateItems);
  const response = await fetch(`${env.calendarServiceUrl.replace(/\/$/, "")}/events/update`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action: "update_events",
      updates: updateItems
    })
  });

  if (!response.ok) {
    throw new Error(
      `Calendar Service respondeu com ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as CalendarUpdateEventsResponse;
}

function normalizeInterpretation(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  normalizedMessageContent?: string
): LlmInterpretation {
  const intentSourceText = normalizedMessageContent?.trim() || message.content;
  const updateIntentDetected = detectUpdateEventIntent(message.content, intentSourceText);
  const deleteIntentDetected = /\bapaga(?:r)?\b/u.test(normalizeLooseText(intentSourceText));
  const normalizedReply = (interpretation.reply ?? "").trim();
  const normalizedFollowUp = (interpretation.followUpQuestion ?? "").trim();
  const mergedExtractedData = sanitizeTimeFieldsFromCurrentTurn(
    mergeExtractedData(
      pending?.extractedData ?? {},
      interpretation.extractedData,
      intentSourceText,
      pending?.missingFields
    ),
    intentSourceText,
    pending
  );

  let normalized: LlmInterpretation = {
    ...interpretation,
    hasCommand: Boolean(interpretation.hasCommand),
    isComplete: Boolean(interpretation.isComplete),
    needsCalendarAction: Boolean(interpretation.needsCalendarAction),
    shouldAskFollowUp: Boolean(interpretation.shouldAskFollowUp),
    missingFields: Array.isArray(interpretation.missingFields)
      ? interpretation.missingFields
      : [],
    followUpQuestion: normalizedFollowUp,
    reply: normalizedReply,
    extractedData: mergedExtractedData,
    notes: interpretation.notes ?? ""
  };

  normalized = applyPendingFieldAnswerHeuristics(message, normalized, pending);
  normalized = stripUnsupportedFreshTitle(intentSourceText, normalized, pending);
  const createIntentDetected = detectCreateEventIntent(
    message.content,
    normalizedMessageContent
  );

  // Detetar intencao de criar evento mesmo quando o LLM classifica como "chat"
  // (ex: "Boa tarde queria marcar um jantar" â€” o LLM foca-se na saudacao)
  if (normalized.command === "chat" && !pending) {
    if (createIntentDetected) {
      normalized.command = "create_event";
      normalized.hasCommand = true;
      normalized.isComplete = false;
      normalized.needsCalendarAction = false;
      normalized.shouldAskFollowUp = true;
      normalized.reply = "";
      normalized.followUpQuestion = "";
      // LLM estava em modo chat â€” titulo extraido e pouco fiavel, limpar para re-inferir
      const cleanedData = { ...normalized.extractedData } as Record<string, unknown>;
      delete cleanedData.title;
      normalized.extractedData = cleanedData;
    }
  }

  if (
    (normalized.command === "chat" || normalized.command === "unknown" || !normalized.hasCommand) &&
    updateIntentDetected
  ) {
    normalized.command = "update_event";
    normalized.hasCommand = true;
    normalized.isComplete = false;
    normalized.needsCalendarAction = false;
    normalized.shouldAskFollowUp = false;
    normalized.reply = "";
    normalized.followUpQuestion = "";
    normalized.extractedData = sanitizeUpdateExtractedData(normalized.extractedData);
  }

  if (
    normalized.command === "create_event" &&
    updateIntentDetected
  ) {
    normalized.command = "update_event";
    normalized.hasCommand = true;
    normalized.isComplete = false;
    normalized.needsCalendarAction = false;
    normalized.shouldAskFollowUp = false;
    normalized.reply = "";
    normalized.followUpQuestion = "";
    normalized.extractedData = sanitizeUpdateExtractedData(normalized.extractedData);
  }

  if (
    pending?.command === "update_event" &&
    (normalized.command === "chat" || normalized.command === "unknown")
  ) {
    normalized.command = "update_event";
    normalized.hasCommand = true;
  }

  if (
    looksLikeListEventsIntent(intentSourceText) &&
    !createIntentDetected &&
    !updateIntentDetected &&
    !deleteIntentDetected
  ) {
    normalized.command = "list_events";
    normalized.hasCommand = true;
    normalized.isComplete = false;
    normalized.needsCalendarAction = false;
    normalized.shouldAskFollowUp = false;
    normalized.reply = "";
    normalized.followUpQuestion = "";
  }

  if (
    pending?.command === "list_events" &&
    (normalized.command === "chat" || normalized.command === "unknown")
  ) {
    normalized.command = "list_events";
    normalized.hasCommand = true;
  }

  if (normalized.command === "chat") {
    normalized = {
      ...normalized,
      hasCommand: false,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: ""
    };
    // Se nao ha pendingCommand, tentar gerar resposta mais natural para saudacoes
    if (!pending) {
      const naturalReply = buildNaturalChatReply(message.content, message.timestamp);
      const acknowledgementReply = buildAcknowledgementReply(message.content);
      if (naturalReply || acknowledgementReply) {
        normalized = {
          ...normalized,
          reply: acknowledgementReply ?? naturalReply ?? normalized.reply
        };
      }
    }
  }

  if (normalized.confidence < 0.7 && normalized.command !== "chat") {
    normalized = {
      ...normalized,
      command: "unknown",
      hasCommand: false,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true
    };
  }

  if (normalized.command === "unknown" && normalized.followUpQuestion.length === 0) {
    normalized.followUpQuestion =
      "Nao percebi completamente o pedido. Queres marcar, consultar ou eliminar algum evento?";
  }

  if (
    normalized.hasCommand &&
    !normalized.isComplete &&
    normalized.followUpQuestion.length === 0
  ) {
    normalized.followUpQuestion = buildMissingDataQuestion(normalized);
  }

  if (normalized.shouldAskFollowUp && normalized.reply.length === 0) {
    normalized.reply = normalized.followUpQuestion;
  }

  if (normalized.reply.length === 0) {
    normalized.reply =
      "Sou o Pulse. Diz-me o que queres fazer na tua agenda: marcar, consultar ou eliminar um evento.";
  }

  if (normalized.command === "create_event") {
    const extractedData = sanitizeExtractedDataKeys(normalized.extractedData);
    if (
      hasExplicitDescriptionSkipInstruction(message.content) &&
      !Array.isArray(extractedData.batchItems) &&
      !hasNonEmptyValue(extractedData.description)
    ) {
      extractedData.__descriptionSkipped = true;
      delete extractedData.description;
      normalized = {
        ...normalized,
        extractedData,
        missingFields: normalized.missingFields.filter((field) => field !== "description")
      };
    }

    normalized = enrichCreateEventInterpretation(normalized);

    // Apos a validacao do orchestrator, reconstroi a followUpQuestion com base
    // nos missingFields validados â€” nao confiamos na pergunta do LLM aqui.
    // Excecao: "description" e "titleConfirmation" sao tratados por enrichCreateEventInterpretation
    // com perguntas contextuais â€” nao sobrescrever com a versao generica de buildMissingDataQuestion.
    const handledByEnrich = normalized.missingFields.every(
      (f) => f === "description" || f === "titleConfirmation"
    );
    if (normalized.missingFields.length > 0 && !normalized.isComplete && !handledByEnrich) {
      normalized.followUpQuestion = buildMissingDataQuestion(normalized);
      normalized.shouldAskFollowUp = true;
      normalized.reply = normalized.followUpQuestion;
    }
  }

  if (
    normalized.command === "chat" &&
    normalized.reply.length > 0 &&
    !isAgendaScopedChatReply(normalized.reply)
  ) {
    normalized.reply =
      "Posso ajudar com a tua agenda. Diz-me se queres marcar, consultar ou eliminar um evento.";
  }

  return normalized;
}

function shouldHandleAdvancedCreateEvent(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null
): boolean {
  if (pending?.command === "create_event") {
    return isPendingBatchCreate(pending) || isPendingRecurringCreate(pending);
  }

  if (interpretation.command !== "create_event") {
    return false;
  }

  const currentDate = getTimeContext(resolveReferenceTime(message.timestamp)).currentDate;
  if (extractWeeklyRecurrenceFromMessage(message.content, currentDate)) {
    return true;
  }

  return extractBatchCreateDrafts(message.content, currentDate).length > 1;
}

function resolveAdvancedCreateEventInterpretation(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null
): LlmInterpretation {
  if (pending?.command === "create_event" && isPendingBatchCreate(pending)) {
    return resolvePendingBatchCreateReply(message.content, interpretation, pending);
  }

  if (pending?.command === "create_event" && isPendingRecurringCreate(pending)) {
    return resolvePendingRecurringCreateReply(message.content, interpretation, pending);
  }

  const currentDate = getTimeContext(resolveReferenceTime(message.timestamp)).currentDate;
  const recurring = extractWeeklyRecurrenceFromMessage(message.content, currentDate);
  if (recurring) {
    return buildRecurringCreateInterpretation(
      interpretation,
      recurring.draft,
      recurring.recurrence,
      hasExplicitDescriptionSkipInstruction(message.content)
    );
  }

  const batchDrafts = extractBatchCreateDrafts(message.content, currentDate);
  if (batchDrafts.length > 1) {
    return buildBatchCreateInterpretation(
      interpretation,
      batchDrafts,
      hasExplicitDescriptionSkipInstruction(message.content)
    );
  }

  return interpretation;
}

function isPendingBatchCreate(pending: PendingCommand): boolean {
  return getCreateDraftArray(pending.extractedData.batchItems).length > 1;
}

function isPendingRecurringCreate(pending: PendingCommand): boolean {
  return getWeeklyRecurrence(pending.extractedData.recurrence) !== null;
}

function buildBatchCreateInterpretation(
  base: LlmInterpretation,
  drafts: CreateEventDraft[],
  descriptionSkipped = false
): LlmInterpretation {
  const nextDrafts = drafts.map((draft) => {
    const normalizedDraft = normalizeCreateDraft(draft);
    if (descriptionSkipped) {
      delete normalizedDraft.description;
      normalizedDraft.__descriptionSkipped = true;
    }

    return normalizedDraft;
  });
  const missingEndIndexes = getDraftIndexesMissingField(nextDrafts, "endTime");

  if (missingEndIndexes.length > 0) {
    const question = buildBatchEndTimeQuestion(nextDrafts, missingEndIndexes);
    return {
      ...base,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["batchEndTimes"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        batchItems: nextDrafts
      }
    };
  }

  const missingDescriptionIndexes = getDraftIndexesMissingBatchDescription(nextDrafts);
  if (!descriptionSkipped && missingDescriptionIndexes.length > 0) {
    const question = buildBatchDescriptionQuestion(nextDrafts, missingDescriptionIndexes);
    return {
      ...base,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["batchDescription"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        batchItems: nextDrafts
      }
    };
  }

  return {
    ...base,
    command: "create_event",
    hasCommand: true,
    isComplete: true,
    needsCalendarAction: true,
    shouldAskFollowUp: false,
    missingFields: [],
    followUpQuestion: "",
    reply: buildBatchCreateReadyReply(nextDrafts),
    extractedData: {
      batchItems: nextDrafts,
      createItems: nextDrafts
    }
  };
}

function resolvePendingBatchCreateReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  pending: PendingCommand
): LlmInterpretation {
  const drafts = getCreateDraftArray(pending.extractedData.batchItems).map(normalizeCreateDraft);
  if (drafts.length <= 1) {
    return interpretation;
  }

  if (pending.missingFields.includes("batchEndTimes")) {
    const missingEndIndexes = getDraftIndexesMissingField(drafts, "endTime");
    const orderedTimes = extractOrderedReplyTimes(latestMessage);
    if (orderedTimes.length >= missingEndIndexes.length) {
      const nextDrafts = drafts.map((draft) => ({ ...draft }));
      missingEndIndexes.forEach((draftIndex, index) => {
        nextDrafts[draftIndex].endTime = orderedTimes[index];
      });
      return buildBatchCreateInterpretation(interpretation, nextDrafts);
    }

    const question = `${buildBatchEndTimeQuestion(drafts, missingEndIndexes)}\nPodes responder pela mesma ordem, por exemplo: 12 e 13.`;
    return {
      ...interpretation,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["batchEndTimes"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        batchItems: drafts
      }
    };
  }

  if (pending.missingFields.includes("batchDescription")) {
    if (isDescriptionSkipReply(latestMessage)) {
      return buildBatchCreateInterpretation(interpretation, drafts, true);
    }

    const nextDrafts = resolveBatchDescriptionReply(drafts, latestMessage);
    if (nextDrafts) {
      return buildBatchCreateInterpretation(interpretation, nextDrafts);
    }

    const question = buildBatchDescriptionQuestion(
      drafts,
      getDraftIndexesMissingBatchDescription(drafts)
    );
    return {
      ...interpretation,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["batchDescription"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        batchItems: drafts
      }
    };
  }

  return buildBatchCreateInterpretation(interpretation, drafts);
}

function buildRecurringCreateInterpretation(
  base: LlmInterpretation,
  draft: CreateEventDraft,
  recurrence: WeeklyRecurrence,
  descriptionSkipped = false
): LlmInterpretation {
  const normalizedDraft = normalizeCreateDraft(draft);
  if (descriptionSkipped) {
    delete normalizedDraft.description;
    normalizedDraft.__descriptionSkipped = true;
  }
  const missingEndTime = !hasNonEmptyValue(normalizedDraft.endTime);
  const missingUntil = !hasNonEmptyValue(recurrence.untilDate);

  if (missingEndTime || missingUntil) {
    const question = buildRecurringScheduleQuestion(normalizedDraft, recurrence, {
      missingEndTime,
      missingUntil
    });
    return {
      ...base,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: [
        ...(missingEndTime ? ["recurrenceEndTime"] : []),
        ...(missingUntil ? ["recurrenceUntil"] : [])
      ],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        ...normalizedDraft,
        recurrence
      }
    };
  }

  if (!descriptionSkipped && !hasNonEmptyValue(normalizedDraft.description)) {
    const question = `Queres adicionar alguma descricao comum a todas as ocorrencias de ${buildDraftTitleReference(
      normalizedDraft
    )}? (podes 'saltar' se quiseres)`;
    return {
      ...base,
      command: "create_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["recurrenceDescription"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        ...normalizedDraft,
        recurrence
      }
    };
  }

  const createItems = expandWeeklyRecurringDraft(normalizedDraft, recurrence);
  return {
    ...base,
    command: "create_event",
    hasCommand: true,
    isComplete: true,
    needsCalendarAction: true,
    shouldAskFollowUp: false,
    missingFields: [],
    followUpQuestion: "",
    reply: buildRecurringCreateReadyReply(normalizedDraft, recurrence, createItems.length),
    extractedData: {
      ...normalizedDraft,
      recurrence,
      createItems
    }
  };
}

function resolvePendingRecurringCreateReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  pending: PendingCommand
): LlmInterpretation {
  const recurrence = getWeeklyRecurrence(pending.extractedData.recurrence);
  if (!recurrence) {
    return interpretation;
  }

  const draft = normalizeCreateDraft(pending.extractedData);
  const nextDraft = { ...draft };
  const nextRecurrence: WeeklyRecurrence = { ...recurrence };

  if (pending.missingFields.includes("recurrenceEndTime")) {
    const orderedTimes = extractOrderedReplyTimes(latestMessage);
    if (orderedTimes.length > 0) {
      nextDraft.endTime = orderedTimes[0];
    }
  }

  if (pending.missingFields.includes("recurrenceUntil")) {
    const until = resolveRecurrenceUntilFromMessage(latestMessage, recurrence.firstDate);
    if (until) {
      nextRecurrence.untilDate = until.untilDate;
      nextRecurrence.untilRaw = until.raw;
    }
  }

  if (
    pending.missingFields.includes("recurrenceDescription") &&
    !hasNonEmptyValue(nextDraft.description)
  ) {
    if (isDescriptionSkipReply(latestMessage)) {
      return buildRecurringCreateInterpretation(interpretation, nextDraft, nextRecurrence, true);
    }

    const description = normalizeCommonDescriptionReply(latestMessage);
    if (description) {
      nextDraft.description = description;
    } else {
      const question = `Queres adicionar alguma descricao comum a todas as ocorrencias de ${buildDraftTitleReference(
        nextDraft
      )}? (podes 'saltar' se quiseres)`;
      return {
        ...interpretation,
        command: "create_event",
        hasCommand: true,
        isComplete: false,
        needsCalendarAction: false,
        shouldAskFollowUp: true,
        missingFields: ["recurrenceDescription"],
        followUpQuestion: question,
        reply: question,
        extractedData: {
          ...nextDraft,
          recurrence: nextRecurrence
        }
      };
    }
  }

  return buildRecurringCreateInterpretation(interpretation, nextDraft, nextRecurrence);
}

function extractBatchCreateDrafts(text: string, currentDate: string): CreateEventDraft[] {
  const clauses = splitCreateClauses(text);
  if (clauses.length < 2) {
    return [];
  }

  const drafts = clauses
    .map((clause) => parseCreateDraftFromText(clause, currentDate))
    .filter((draft): draft is CreateEventDraft => draft !== null);

  if (drafts.length < 2) {
    return [];
  }

  const allSchedulable = drafts.every(
    (draft) =>
      hasNonEmptyValue(draft.title) &&
      hasNonEmptyValue(draft.date) &&
      hasNonEmptyValue(draft.startTime)
  );

  return allSchedulable ? drafts : [];
}

function parseCreateDraftFromText(text: string, currentDate: string): CreateEventDraft | null {
  const title = inferFlexibleCreateTitle(text);
  const resolvedDate = resolveDeterministicDateFromMessage(text, currentDate);
  const timeData = extractTimeData(text);
  const startTime = normalizeClockTimeValue(timeData.startTime);
  const endTime = normalizeClockTimeValue(timeData.endTime);
  const description = inferDescriptionFromContext(text) ?? undefined;

  if (!title && !resolvedDate && !startTime && !endTime && !description) {
    return null;
  }

  const draft: CreateEventDraft = {
    ...(title ? { title } : {}),
    ...(resolvedDate?.date ? { date: resolvedDate.date, rawDate: resolvedDate.raw } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(description ? { description } : {})
  };

  const category = deriveEventCategory(draft as Record<string, unknown>);
  if (category) {
    draft.category = category;
  }

  return normalizeCreateDraft(draft);
}

function extractWeeklyRecurrenceFromMessage(
  text: string,
  currentDate: string
): { draft: CreateEventDraft; recurrence: WeeklyRecurrence } | null {
  const normalized = normalizeLooseText(text);
  const match = normalized.match(
    /\btodas?\s+(?:as\s+)?(segunda|segundas|terca|tercas|quarta|quartas|quinta|quintas|sexta|sextas|sabado|sabados|domingo|domingos)(?:-feira)?s?\b/u
  );
  if (!match) {
    return null;
  }

  const weekday = normalizeRecurringWeekday(match[1]);
  if (!weekday) {
    return null;
  }

  const title = inferFlexibleCreateTitle(text);
  const timeData = extractTimeData(text);
  const startTime = normalizeClockTimeValue(timeData.startTime);
  const endTime = normalizeClockTimeValue(timeData.endTime);
  const description = inferDescriptionFromContext(text) ?? undefined;
  if (!title || !startTime) {
    return null;
  }

  const firstDate = formatIsoDate(resolveWeekdayFromAnchor(parseIsoDate(currentDate), weekday));
  const recurrence: WeeklyRecurrence = {
    frequency: "weekly",
    weekday,
    raw: match[0],
    firstDate
  };

  const until = resolveRecurrenceUntilFromMessage(text, firstDate);
  if (until) {
    recurrence.untilDate = until.untilDate;
    recurrence.untilRaw = until.raw;
  }

  const draft: CreateEventDraft = normalizeCreateDraft({
    title,
    date: firstDate,
    rawDate: match[0],
    startTime,
    ...(endTime ? { endTime } : {}),
    ...(description ? { description } : {})
  });

  const category = deriveEventCategory(draft as Record<string, unknown>);
  if (category) {
    draft.category = category;
  }

  return {
    draft,
    recurrence
  };
}

function normalizeCreateDraft(draft: CreateEventDraft): CreateEventDraft {
  const next: CreateEventDraft = { ...draft };

  if (typeof next.title === "string") {
    next.title = normalizeSentenceCase(next.title);
  }
  if (typeof next.date === "string") {
    const normalizedDate = normalizeDateValue(next.date);
    if (normalizedDate) {
      next.date = normalizedDate;
    }
  }
  if (typeof next.endDate === "string") {
    const normalizedEndDate = normalizeDateValue(next.endDate);
    if (normalizedEndDate) {
      next.endDate = normalizedEndDate;
    }
  }
  if (typeof next.startTime === "string") {
    const normalizedStart = normalizeClockTimeValue(next.startTime);
    if (normalizedStart) {
      next.startTime = normalizedStart;
    }
  }
  if (typeof next.endTime === "string") {
    const normalizedEnd = normalizeClockTimeValue(next.endTime);
    if (normalizedEnd) {
      next.endTime = normalizedEnd;
    }
  }
  if (typeof next.description === "string") {
    next.description = normalizeSentenceCase(next.description);
  }
  if (typeof next.category === "string") {
    next.category = normalizeExplicitCategoryValue(next.category) ?? next.category;
  }
  if (typeof next.allDay !== "boolean") {
    delete next.allDay;
  }

  return next;
}

function getCreateDraftArray(value: unknown): CreateEventDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is CreateEventDraft =>
      Boolean(item) &&
      typeof item === "object" &&
      (typeof (item as CreateEventDraft).title === "string" ||
        typeof (item as CreateEventDraft).date === "string" ||
        typeof (item as CreateEventDraft).startTime === "string")
  );
}

function getWeeklyRecurrence(value: unknown): WeeklyRecurrence | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.frequency !== "weekly" ||
    typeof record.weekday !== "string" ||
    typeof record.raw !== "string" ||
    typeof record.firstDate !== "string"
  ) {
    return null;
  }

  return {
    frequency: "weekly",
    weekday: record.weekday,
    raw: record.raw,
    firstDate: record.firstDate,
    ...(typeof record.untilDate === "string" ? { untilDate: record.untilDate } : {}),
    ...(typeof record.untilRaw === "string" ? { untilRaw: record.untilRaw } : {})
  };
}

function getDraftIndexesMissingField(
  drafts: CreateEventDraft[],
  field: keyof CreateEventDraft
): number[] {
  return drafts.flatMap((draft, index) => (hasNonEmptyValue(draft[field]) ? [] : [index]));
}

function getDraftIndexesMissingBatchDescription(drafts: CreateEventDraft[]): number[] {
  return drafts.flatMap((draft, index) =>
    hasNonEmptyValue(draft.description) || draft.__descriptionSkipped === true ? [] : [index]
  );
}

function buildBatchEndTimeQuestion(drafts: CreateEventDraft[], missingIndexes: number[]): string {
  const titles = missingIndexes.map((index) => buildDraftTitleReference(drafts[index]));
  return `A que horas termina ${joinNaturalList(titles)}?`;
}

function buildBatchDescriptionQuestion(
  drafts: CreateEventDraft[],
  missingIndexes: number[] = getDraftIndexesMissingBatchDescription(drafts)
): string {
  const targets = missingIndexes.map((index) => buildDraftTitleReference(drafts[index]));
  if (targets.length <= 1) {
    return `Queres adicionar alguma descricao para ${targets[0] ?? "o evento"}? (podes 'saltar' se quiseres)`;
  }

  return `Queres adicionar alguma descricao para ${joinNaturalList(
    targets
  )}? Podes responder pela mesma ordem, por exemplo: 'tenho que levar o carro e nada', ou referenciar: 'no almoco tenho que levar o carro e na consulta nada'. (podes 'saltar' se quiseres)`;
}

function buildBatchCreateReadyReply(drafts: CreateEventDraft[]): string {
  return [
    `Perfeito. Vou registar ${drafts.length} eventos na agenda:`,
    ...drafts.map((draft, index) => `${index + 1}. ${formatCreateDraftSummary(draft)}`)
  ].join("\n");
}

function buildBatchCreateSuccessReply(
  extractedData: Record<string, unknown>,
  drafts: CreateEventDraft[],
  createdCount: number
): string {
  const recurrence = getWeeklyRecurrence(extractedData.recurrence);
  if (recurrence && drafts.length > 0) {
    return buildRecurringCreateSuccessReply(drafts[0], recurrence, createdCount);
  }

  return [
    `Perfeito. Registei ${createdCount} eventos na agenda:`,
    ...drafts.map((draft, index) => `${index + 1}. ${formatCreateDraftSummary(draft)}`)
  ].join("\n");
}

function buildRecurringCreateReadyReply(
  draft: CreateEventDraft,
  recurrence: WeeklyRecurrence,
  occurrenceCount: number
): string {
  return buildRecurringCreateSuccessReply(draft, recurrence, occurrenceCount).replace(
    "Registei",
    "Vou registar"
  );
}

function buildRecurringCreateSuccessReply(
  draft: CreateEventDraft,
  recurrence: WeeklyRecurrence,
  occurrenceCount: number
): string {
  const untilText =
    recurrence.untilRaw && recurrence.untilDate
      ? `${recurrence.untilRaw} (${formatShortDate(recurrence.untilDate)})`
      : recurrence.untilDate
        ? formatShortDate(recurrence.untilDate)
        : "o periodo definido";
  const titleRef = draft.title ?? "o evento";
  const startTime = draft.startTime ?? "";
  const endTime = draft.endTime ?? "";

  return `Perfeito. Registei ${occurrenceCount} ocorrencias de ${titleRef} na agenda, todas as ${formatRecurringWeekdayPlural(
    recurrence.weekday
  )}, das ${startTime} as ${endTime}, ate ${untilText}.`;
}

function buildRecurringScheduleQuestion(
  draft: CreateEventDraft,
  recurrence: WeeklyRecurrence,
  options: { missingEndTime: boolean; missingUntil: boolean }
): string {
  const titleRef = buildDraftTitleReference(draft);
  if (options.missingEndTime && options.missingUntil) {
    return `E ate que horas vai durar ${titleRef}, e ate quando queres repetir? Podes dizer, por exemplo, 'ate as 12 e ate ao fim do ano'.`;
  }
  if (options.missingEndTime) {
    return `E ate que horas vai durar ${titleRef} todas as ${formatRecurringWeekdayPlural(
      recurrence.weekday
    )}?`;
  }

  return `Ate quando queres repetir ${titleRef} todas as ${formatRecurringWeekdayPlural(
    recurrence.weekday
  )}? Podes dizer, por exemplo, 'ate ao fim do mes', 'ate ao fim do ano' ou uma data.`;
}

function extractOrderedReplyTimes(text: string): string[] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const explicitMatches = normalized.matchAll(/\b(?:as|ate|ate as|das?)\s+(\d{1,2})(?::(\d{2}))?\b/gu);
  const explicitTimes = Array.from(explicitMatches)
    .map((match) => {
      const hour = Number(match[1]);
      if (Number.isNaN(hour) || hour < 0 || hour > 23) {
        return null;
      }
      return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}`;
    })
    .filter((value): value is string => value !== null);

  if (explicitTimes.length > 0) {
    return explicitTimes;
  }

  const bareMatches = normalized.match(/\b\d{1,2}(?::\d{2})?\b/gu) ?? [];
  return bareMatches
    .map((match) => {
      if (match.includes(":")) {
        return normalizeClockTimeValue(match);
      }
      const hour = Number(match);
      if (Number.isNaN(hour) || hour < 0 || hour > 23) {
        return null;
      }
      return `${String(hour).padStart(2, "0")}:00`;
    })
    .filter((value): value is string => value !== null);
}

function resolveBatchDescriptionReply(
  drafts: CreateEventDraft[],
  latestMessage: string
): CreateEventDraft[] | null {
  const missingIndexes = getDraftIndexesMissingBatchDescription(drafts);
  if (missingIndexes.length === 0) {
    return drafts;
  }

  const referenced = resolveReferencedBatchDescriptions(drafts, latestMessage, missingIndexes);
  if (referenced) {
    return referenced;
  }

  return resolveOrderedBatchDescriptions(drafts, latestMessage, missingIndexes);
}

function resolveReferencedBatchDescriptions(
  drafts: CreateEventDraft[],
  latestMessage: string,
  missingIndexes: number[]
): CreateEventDraft[] | null {
  const normalized = normalizeLooseText(latestMessage);
  const matches = missingIndexes
    .map((index) => {
      const title = typeof drafts[index].title === "string" ? drafts[index].title : "";
      const normalizedTitle = normalizeLooseText(title);
      if (!normalizedTitle) {
        return null;
      }

      const regex = new RegExp(
        `\\b(?:n[oa]s?|d[oa]s?|para\\s+[oa]s?|em\\s+[oa]s?)?\\s*${escapeRegExp(normalizedTitle)}\\b`,
        "u"
      );
      const match = regex.exec(normalized);
      if (!match || match.index === undefined) {
        return null;
      }

      return {
        index,
        start: match.index,
        end: match.index + match[0].length
      };
    })
    .filter(
      (
        match
      ): match is {
        index: number;
        start: number;
        end: number;
      } => match !== null
    )
    .sort((left, right) => left.start - right.start);

  if (matches.length === 0) {
    return null;
  }

  const nextDrafts = drafts.map((draft) => ({ ...draft }));
  let appliedCount = 0;

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : normalized.length;
    const segment = normalized.slice(current.end, nextStart);
    const resolved = resolveBatchDescriptionValue(segment);
    if (!resolved) {
      continue;
    }

    if (resolved.skip) {
      delete nextDrafts[current.index].description;
      nextDrafts[current.index].__descriptionSkipped = true;
      appliedCount += 1;
      continue;
    }

    nextDrafts[current.index].description = resolved.description;
    delete nextDrafts[current.index].__descriptionSkipped;
    appliedCount += 1;
  }

  return appliedCount > 0 ? nextDrafts : null;
}

function resolveOrderedBatchDescriptions(
  drafts: CreateEventDraft[],
  latestMessage: string,
  missingIndexes: number[]
): CreateEventDraft[] | null {
  const normalized = normalizeLooseText(latestMessage)
    .replace(/^(?:sim|ok|okay|certo|perfeito)\b[\s,:-]*/u, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parts =
    missingIndexes.length <= 1
      ? [normalized]
      : normalized
          .split(/\s+e\s+/u)
          .map((part) => part.trim())
          .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return null;
  }

  const nextDrafts = drafts.map((draft) => ({ ...draft }));
  let appliedCount = 0;

  for (let i = 0; i < Math.min(parts.length, missingIndexes.length); i += 1) {
    const resolved = resolveBatchDescriptionValue(parts[i]);
    if (!resolved) {
      continue;
    }

    const draftIndex = missingIndexes[i];
    if (resolved.skip) {
      delete nextDrafts[draftIndex].description;
      nextDrafts[draftIndex].__descriptionSkipped = true;
      appliedCount += 1;
      continue;
    }

    nextDrafts[draftIndex].description = resolved.description;
    delete nextDrafts[draftIndex].__descriptionSkipped;
    appliedCount += 1;
  }

  return appliedCount > 0 ? nextDrafts : null;
}

function resolveBatchDescriptionValue(
  text: string
): { description: string; skip: false } | { skip: true } | null {
  const cleaned = stripBatchDescriptionSegment(text);
  if (!cleaned) {
    return null;
  }

  if (isNoDescriptionPhrase(cleaned)) {
    return { skip: true };
  }

  const description = normalizeCommonDescriptionReply(cleaned);
  if (!description) {
    return null;
  }

  return {
    description,
    skip: false
  };
}

function stripBatchDescriptionSegment(text: string): string {
  return text
    .trim()
    .replace(/^[,;:.!?-]+/u, "")
    .replace(/^(?:sim|ok|okay|certo|perfeito)\b[\s,:-]*/iu, "")
    .replace(/^(?:meter|mete|coloca|por|poe|p[oÃ´]e|fica|quero(?:\s+meter)?|podes?\s+meter)\s+(?:para\s+)?/iu, "")
    .replace(/\s+e\s+(?:n[oa]s?|d[oa]s?|para\s+[oa]s?)?\s*$/iu, "")
    .replace(/\s+e\s*$/iu, "")
    .replace(/[.?!\s]+$/u, "")
    .trim();
}

function isNoDescriptionPhrase(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return isDescriptionSkipReply(text) || /^(?:nao|nada|nenhuma|nenhum|sem\s+descricao|sem\s+descricao|nao\s+quero\s+nada|nao\s+tenho\s+nada|nada\s+de\s+especial|nada\s+para\s+(?:ja|meter|por))$/u.test(
    normalized
  );
}

function normalizeCommonDescriptionReply(text: string): string | null {
  if (!text.trim() || isDescriptionSkipReply(text) || looksLikeTemporalOnly(text)) {
    return null;
  }

  const cleaned = cleanDescriptionCandidate(text);
  return cleaned ? normalizeSentenceCase(cleaned) : null;
}

function resolveRecurrenceUntilFromMessage(
  text: string,
  firstDate: string
): { untilDate: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const first = parseIsoDate(firstDate);

  if (/\b(?:deste|este)\s+ano\b/u.test(normalized)) {
    return {
      untilDate: formatIsoDate(new Date(Date.UTC(first.getUTCFullYear(), 11, 31))),
      raw: "ao fim deste ano"
    };
  }

  if (/\b(?:deste|este)\s+mes\b/u.test(normalized)) {
    const range = getMonthRange(first.getUTCFullYear(), first.getUTCMonth());
    return {
      untilDate: formatIsoDate(range.end),
      raw: "ao fim deste mes"
    };
  }

  if (/\bfim\s+do\s+ano\b/u.test(normalized)) {
    return {
      untilDate: formatIsoDate(new Date(Date.UTC(first.getUTCFullYear(), 11, 31))),
      raw: "ao fim do ano"
    };
  }

  if (/\bfim\s+do\s+mes\b/u.test(normalized)) {
    const range = getMonthRange(first.getUTCFullYear(), first.getUTCMonth());
    return {
      untilDate: formatIsoDate(range.end),
      raw: "ao fim do mes"
    };
  }

  const endOfNamedMonth = normalized.match(
    /\bfim\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/u
  );
  if (endOfNamedMonth) {
    const monthIndex = monthNameToIndex(endOfNamedMonth[1]);
    let year = first.getUTCFullYear();
    if (monthIndex < first.getUTCMonth()) {
      year += 1;
    }
    const range = getMonthRange(year, monthIndex);
    return {
      untilDate: formatIsoDate(range.end),
      raw: `ao fim de ${endOfNamedMonth[1]}`
    };
  }

  if (/\bproximo\s+mes\b|\bproxima\s+mes\b/u.test(normalized)) {
    const range = getMonthRange(first.getUTCFullYear(), first.getUTCMonth() + 1);
    return {
      untilDate: formatIsoDate(range.end),
      raw: "ao fim do proximo mes"
    };
  }

  const weeksMatch = normalized.match(/\b(?:durante|por)\s+(\d+)\s+semanas?\b/u);
  if (weeksMatch) {
    const amount = Number(weeksMatch[1]);
    if (amount >= 1) {
      return {
        untilDate: formatIsoDate(addDays(first, (amount - 1) * 7)),
        raw: `durante ${amount} semanas`
      };
    }
  }

  const explicitDate = resolveDeterministicDateFromMessage(text, firstDate);
  if (explicitDate) {
    return {
      untilDate: explicitDate.date,
      raw: explicitDate.raw
    };
  }

  return null;
}

function expandWeeklyRecurringDraft(
  draft: CreateEventDraft,
  recurrence: WeeklyRecurrence
): CreateEventDraft[] {
  if (!recurrence.untilDate) {
    return [];
  }

  const results: CreateEventDraft[] = [];
  let cursor = parseIsoDate(recurrence.firstDate);
  const until = parseIsoDate(recurrence.untilDate);

  while (cursor.getTime() <= until.getTime()) {
    results.push(
      normalizeCreateDraft({
        ...draft,
        date: formatIsoDate(cursor),
        rawDate: recurrence.raw
      })
    );
    cursor = addDays(cursor, 7);
  }

  return results;
}

function splitCreateClauses(text: string): string[] {
  return text
    .split(
      /\s+e\s+(?=(?:o|a|os|as|um|uma|na|no|para|segunda|terca|quarta|quinta|sexta|sabado|domingo|reuniao|reunioes|consulta|consultas|almoco|jantar|cafe|treino|viagem|dentista)\b)/iu
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function inferFlexibleCreateTitle(message: string): string | null {
  const normalized = normalizeLooseText(message);

  if (/\b(?:reuniao|reunioes)\b/u.test(normalized)) return "Reuniao";
  if (/\b(?:consulta|consultas)\b/u.test(normalized)) return "Consulta";
  if (/\bdentista\b/u.test(normalized)) return "Dentista";
  if (/\b(?:almoco|almocos)\b/u.test(normalized)) return "Almoco";
  if (/\b(?:jantar|jantares)\b/u.test(normalized)) return "Jantar";
  if (/\b(?:cafe|cafes)\b/u.test(normalized)) return "Cafe";
  if (/\b(?:treino|treinos)\b/u.test(normalized)) return "Treino";
  if (/\b(?:viagem|viagens)\b/u.test(normalized)) return "Viagem";
  if (/\bferias\b/u.test(normalized)) return "Ferias";
  if (/\b(?:aniversario|aniversarios)\b/u.test(normalized)) return "Aniversario";
  if (/\b(?:trabalho|trabalhos)\b/u.test(normalized)) return "Trabalho";

  return inferExplicitEventTypeTitle(message) ?? inferUnknownEventTitle(message);
}

function normalizeRecurringWeekday(value: string): string | null {
  const normalized = normalizeLooseText(value);
  const map: Record<string, string> = {
    segundas: "segunda",
    segunda: "segunda",
    tercas: "terca",
    terca: "terca",
    quartas: "quarta",
    quarta: "quarta",
    quintas: "quinta",
    quinta: "quinta",
    sextas: "sexta",
    sexta: "sexta",
    sabados: "sabado",
    sabado: "sabado",
    domingos: "domingo",
    domingo: "domingo"
  };

  return map[normalized] ?? null;
}

function formatRecurringWeekdayPlural(weekday: string): string {
  const normalized = normalizeRecurringWeekday(weekday) ?? weekday;
  const map: Record<string, string> = {
    segunda: "segundas",
    terca: "tercas",
    quarta: "quartas",
    quinta: "quintas",
    sexta: "sextas",
    sabado: "sabados",
    domingo: "domingos"
  };

  return map[normalized] ?? normalized;
}

function buildDraftTitleReference(draft: CreateEventDraft): string {
  const title = typeof draft.title === "string" ? draft.title : "o evento";
  const lower = title.charAt(0).toLowerCase() + title.slice(1);
  return `${getTitleArticle(lower)} ${lower}`;
}

function formatCreateDraftSummary(draft: CreateEventDraft): string {
  const title = draft.title ?? "Evento";
  const date = draft.date ? formatFriendlyDate(draft.date) : "data por definir";
  const startTime = draft.startTime ?? "--:--";
  const endTime = draft.endTime ?? "--:--";
  let summary = `${title} - ${date} - ${startTime} as ${endTime}`;
  if (draft.description) {
    summary += ` - ${draft.description}`;
  }
  return summary;
}

function joinNaturalList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} e ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

function shouldHandleUpdateEvent(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  normalizedMessageContent?: string
): boolean {
  return (
    interpretation.command === "update_event" ||
    pending?.command === "update_event" ||
    detectUpdateEventIntent(message.content, normalizedMessageContent)
  );
}

async function resolveUpdateEventInterpretation(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  options: MessageProcessingOptions,
  normalizedMessageContent?: string
): Promise<LlmInterpretation> {
  const sourceText = normalizedMessageContent?.trim() || message.content;
  const extractedData = sanitizeUpdateExtractedData(interpretation.extractedData);

  if (pending?.command === "update_event" && pending.missingFields.includes("updateSelection")) {
    return resolveUpdateSelectionReply(message.content, interpretation, pending);
  }

  if (
    pending?.command === "update_event" &&
    (pending.missingFields.includes("updateKeepTime") ||
      pending.missingFields.includes("updateTime"))
  ) {
    return resolveUpdateKeepTimeReply(message.content, interpretation, pending);
  }

  const drafts = resolveUpdateDraftsFromMessage(sourceText);
  if (drafts.length === 0) {
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateTarget"],
      followUpQuestion:
        "Que evento queres alterar e para quando? Podes dizer, por exemplo, 'altera o almoco de amanha para dia 30'.",
      reply:
        "Que evento queres alterar e para quando? Podes dizer, por exemplo, 'altera o almoco de amanha para dia 30'.",
      extractedData
    };
  }

  const draftsWithMatches = await Promise.all(
    drafts.map(async (draft) => ({
      ...draft,
      matchedEvents: await searchCalendarEvents(
        message,
        {
          title: draft.targetTitle,
          date: draft.targetDate,
          dateFrom: draft.targetDateFrom,
          dateTo: draft.targetDateTo,
          startTime: draft.targetStartTime,
          endTime: draft.targetEndTime,
          limit: 100
        },
        options
      )
    }))
  );

  return buildUpdateInterpretationFromDrafts(interpretation, draftsWithMatches);
}

function resolveUpdateSelectionReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  pending: PendingCommand
): LlmInterpretation {
  const drafts = getUpdateDraftArray(pending.extractedData.updateItems).map(normalizeUpdateDraft);
  const ambiguousIndex = drafts.findIndex(
    (draft) =>
      getPendingCalendarEvents(draft.matchedEvents).length > 1 &&
      getPendingCalendarEvents(draft.selectedEvents).length === 0
  );

  if (ambiguousIndex < 0) {
    return buildUpdateInterpretationFromDrafts(interpretation, drafts);
  }

  const matchedEvents = getPendingCalendarEvents(drafts[ambiguousIndex].matchedEvents);
  if (matchedEvents.length === 0) {
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Perdi a referencia aos eventos que podiam ser alterados. Pede-me novamente o que queres mudar.",
      extractedData: {
        updateItems: drafts
      }
    };
  }

  if (isNegativePhrase(latestMessage)) {
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Tudo bem, nao alterei nada.",
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const refinedSelection = selectDeleteEventsFromText(latestMessage, matchedEvents);
  if (!refinedSelection.usedSelection || refinedSelection.events.length === 0) {
    const question = buildUpdateSelectionQuestion(drafts[ambiguousIndex], matchedEvents);
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateSelection"],
      followUpQuestion: question,
      reply: `${question}\nPodes responder com numeros, horas, dia, titulo ou ambos.`,
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const nextDrafts = drafts.map((draft, index) =>
    index === ambiguousIndex
      ? {
          ...draft,
          selectedEvents: refinedSelection.events
        }
      : draft
  );

  return buildUpdateInterpretationFromDrafts(interpretation, nextDrafts);
}

function resolveUpdateKeepTimeReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  pending: PendingCommand
): LlmInterpretation {
  const drafts = getUpdateDraftArray(pending.extractedData.updateItems).map(normalizeUpdateDraft);
  const timeData = extractTimeData(latestMessage);
  const explicitStartTime = normalizeClockTimeValue(timeData.startTime);
  const explicitEndTime = normalizeClockTimeValue(timeData.endTime);
  const needsTimeAnswer = drafts.filter(
    (draft) => draftNeedsKeepTimeDecision(draft) || draftNeedsExplicitTimeInput(draft)
  );

  if ((explicitStartTime || explicitEndTime) && needsTimeAnswer.length > 0) {
    const nextDrafts = drafts.map((draft) =>
      draftNeedsKeepTimeDecision(draft) || draftNeedsExplicitTimeInput(draft)
        ? {
            ...draft,
            ...(explicitStartTime ? { newStartTime: explicitStartTime } : {}),
            ...(explicitEndTime ? { newEndTime: explicitEndTime } : {}),
            requiresExplicitTime: false
          }
        : draft
    );
    return buildUpdateInterpretationFromDrafts(interpretation, nextDrafts);
  }

  if (isKeepSameTimePhrase(latestMessage) || isAffirmativePhrase(latestMessage)) {
    const nextDrafts = drafts.map((draft) =>
      draftNeedsKeepTimeDecision(draft) || draftNeedsExplicitTimeInput(draft)
        ? {
            ...draft,
            keepTime: true,
            requiresExplicitTime: false
          }
        : draft
    );
    return buildUpdateInterpretationFromDrafts(interpretation, nextDrafts);
  }

  const question = draftNeedsExplicitTimeInput(drafts[0]!)
    ? `${buildUpdateTimeQuestion(
        drafts.filter(draftNeedsExplicitTimeInput)
      )}\nPodes dizer, por exemplo, 'mete para as 14:00 ate as 15:00'.`
    : `${buildUpdateKeepTimeQuestion(
        drafts.filter(draftNeedsKeepTimeDecision)
      )}\nSe nao quiseres manter as mesmas horas, diz-me explicitamente as novas horas no mesmo pedido.`;
  return {
    ...interpretation,
    command: "update_event",
    hasCommand: true,
    isComplete: false,
    needsCalendarAction: false,
    shouldAskFollowUp: true,
    missingFields: [drafts.some(draftNeedsExplicitTimeInput) ? "updateTime" : "updateKeepTime"],
    followUpQuestion: question,
    reply: question,
    extractedData: {
      updateItems: drafts
    }
  };
}

function buildUpdateInterpretationFromDrafts(
  interpretation: LlmInterpretation,
  draftsInput: UpdateEventDraft[]
): LlmInterpretation {
  const drafts = draftsInput.map(normalizeUpdateDraft).map((draft) => {
    const matchedEvents = getPendingCalendarEvents(draft.matchedEvents);
    if (matchedEvents.length === 1 && getPendingCalendarEvents(draft.selectedEvents).length === 0) {
      return {
        ...draft,
        matchedEvents,
        selectedEvents: matchedEvents
      };
    }

    return {
      ...draft,
      matchedEvents
    };
  });

  const firstNoResult = drafts.find(
    (draft) =>
      hasUpdateTargetFilters(draft) &&
      getPendingCalendarEvents(draft.matchedEvents).length === 0 &&
      getPendingCalendarEvents(draft.selectedEvents).length === 0
  );
  if (firstNoResult) {
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: buildUpdateNoResultsReply(firstNoResult),
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const ambiguousDraft = drafts.find(
    (draft) =>
      getPendingCalendarEvents(draft.matchedEvents).length > 1 &&
      getPendingCalendarEvents(draft.selectedEvents).length === 0
  );
  if (ambiguousDraft) {
    const matchedEvents = getPendingCalendarEvents(ambiguousDraft.matchedEvents);
    const question = buildUpdateSelectionQuestion(ambiguousDraft, matchedEvents);
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateSelection"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const changeMissingDraft = drafts.find((draft) => !hasUpdateChange(draft));
  if (changeMissingDraft) {
    const question = `O que queres alterar em ${formatUpdateDraftReference(changeMissingDraft)}? Podes dizer a nova data, a nova hora ou 'mesma hora'.`;
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateChange"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const explicitTimeDrafts = drafts.filter(draftNeedsExplicitTimeInput);
  if (explicitTimeDrafts.length > 0) {
    const question = `${buildUpdateTimeQuestion(
      explicitTimeDrafts
    )}\nPodes dizer, por exemplo, 'mete para as 14:00 ate as 15:00'.`;
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateTime"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const keepTimeDrafts = drafts.filter(draftNeedsKeepTimeDecision);
  if (keepTimeDrafts.length > 0) {
    const question = buildUpdateKeepTimeQuestion(keepTimeDrafts);
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateKeepTime"],
      followUpQuestion: question,
      reply: question,
      extractedData: {
        updateItems: drafts
      }
    };
  }

  const updateItems = buildCalendarUpdateItemsFromDrafts(drafts);
  if (updateItems.length === 0) {
    return {
      ...interpretation,
      command: "update_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["updateChange"],
      followUpQuestion:
        "Faltam-me detalhes para concluir a alteracao. Diz-me a nova data, a nova hora ou se queres manter as mesmas horas.",
      reply:
        "Faltam-me detalhes para concluir a alteracao. Diz-me a nova data, a nova hora ou se queres manter as mesmas horas.",
      extractedData: {
        updateItems: drafts
      }
    };
  }

  return {
    ...interpretation,
    command: "update_event",
    hasCommand: true,
    isComplete: true,
    needsCalendarAction: true,
    shouldAskFollowUp: false,
    missingFields: [],
    followUpQuestion: "",
    reply: buildUpdateReadyReply(updateItems),
    extractedData: {
      updateItems
    }
  };
}

function buildUpdateSelectionQuestion(
  draft: UpdateEventDraft,
  events: CalendarEventSummary[]
): string {
  return [
    `Encontrei ${events.length} eventos que batem certo com ${formatUpdateDraftReference(draft)}:`,
    ...events.map((event, index) => `${index + 1}. ${formatCalendarEventSummary(event)}`),
    "Qual queres alterar? Podes responder 1, 2, o das 10, ambos ou filtrar por dia, hora e titulo."
  ].join("\n");
}

function buildUpdateKeepTimeQuestion(drafts: UpdateEventDraft[]): string {
  const references = drafts.map((draft) => formatUpdateDraftReference(draft));
  if (references.length === 1) {
    return `Queres manter a mesma hora para ${references[0]}?`;
  }

  return `Queres manter as mesmas horas para ${joinNaturalList(references)}?`;
}

function buildUpdateTimeQuestion(drafts: UpdateEventDraft[]): string {
  const references = drafts.map((draft) => formatUpdateDraftReference(draft));
  if (references.length === 1) {
    return `Que novas horas queres para ${references[0]}?`;
  }

  return `Que novas horas queres para ${joinNaturalList(references)}?`;
}

function buildUpdateNoResultsReply(draft: UpdateEventDraft): string {
  const reference = formatUpdateDraftReference(draft);
  return `Nao encontrei nenhum evento que bata certo com ${reference}.`;
}

function resolveUpdateDraftsFromMessage(text: string): UpdateEventDraft[] {
  const currentDate = getTimeContext().currentDate;
  const stripped = stripUpdateLeadVerb(text);
  const paraCount = stripped.match(/\bpara\b/giu)?.length ?? 0;
  const sharedDrafts = resolveSharedUpdateDrafts(stripped, currentDate);
  if (sharedDrafts.length > 0) {
    return sharedDrafts;
  }

  const clauses = splitUpdateClauses(stripped);
  const drafts = clauses
    .map((clause) => parseSingleUpdateDraft(clause, currentDate))
    .filter((draft): draft is UpdateEventDraft => draft !== null);

  if (drafts.length === 0) {
    return [];
  }

  if (drafts.length > 1 && paraCount === 1) {
    const sourceReferenceDraft =
      drafts.find((draft) => draft.targetDate || draft.targetDateFrom || draft.targetDateTo) ??
      null;
    const changeReferenceDraft =
      [...drafts].reverse().find((draft) => hasUpdateChange(draft)) ?? null;

    if (sourceReferenceDraft || changeReferenceDraft) {
      return drafts.map((draft) => ({
        ...draft,
        ...(!draft.targetDate && !draft.targetDateFrom && !draft.targetDateTo && sourceReferenceDraft
          ? {
              ...(sourceReferenceDraft.targetDate
                ? { targetDate: sourceReferenceDraft.targetDate }
                : {}),
              ...(sourceReferenceDraft.targetRawDate
                ? { targetRawDate: sourceReferenceDraft.targetRawDate }
                : {}),
              ...(sourceReferenceDraft.targetDateFrom
                ? { targetDateFrom: sourceReferenceDraft.targetDateFrom }
                : {}),
              ...(sourceReferenceDraft.targetDateTo
                ? { targetDateTo: sourceReferenceDraft.targetDateTo }
                : {})
            }
          : {}),
        ...(!draft.newDate &&
        !draft.newStartTime &&
        !draft.newEndTime &&
        !draft.keepTime &&
        changeReferenceDraft
          ? {
              ...(changeReferenceDraft.newDate ? { newDate: changeReferenceDraft.newDate } : {}),
              ...(changeReferenceDraft.newRawDate
                ? { newRawDate: changeReferenceDraft.newRawDate }
                : {}),
              ...(changeReferenceDraft.newStartTime
                ? { newStartTime: changeReferenceDraft.newStartTime }
                : {}),
              ...(changeReferenceDraft.newEndTime
                ? { newEndTime: changeReferenceDraft.newEndTime }
                : {}),
              ...(changeReferenceDraft.keepTime ? { keepTime: true } : {})
            }
          : {})
      }));
    }
  }

  if (isKeepSameTimePhrase(stripped)) {
    return drafts.map((draft) =>
      !draft.newStartTime && !draft.newEndTime
        ? {
            ...draft,
            keepTime: true
          }
        : draft
    );
  }

  return drafts;
}

function resolveSharedUpdateDrafts(
  text: string,
  currentDate: string
): UpdateEventDraft[] {
  const paraMatches = text.match(/\bpara\b/giu) ?? [];
  if (paraMatches.length !== 1) {
    return [];
  }

  const separatorIndex = text.search(/\bpara\b/iu);
  if (separatorIndex < 0) {
    return [];
  }

  const targetSegment = text.slice(0, separatorIndex).trim();
  const changeSegment = text.slice(separatorIndex + 4).trim();
  const titles = extractExplicitEventTypeTitlesInOrder(targetSegment);
  if (titles.length < 2) {
    return [];
  }

  const baseTarget = parseUpdateTargetFilters(targetSegment, currentDate);
  const changes = parseUpdateChanges(changeSegment, currentDate);
  if (!hasUpdateChange(changes)) {
    return [];
  }

  return titles.map((title) => ({
    ...baseTarget,
    targetTitle: title,
    ...changes
  }));
}

function parseSingleUpdateDraft(
  text: string,
  currentDate: string
): UpdateEventDraft | null {
  const separatorIndex = text.search(/\bpara\b/iu);
  const targetSegment = separatorIndex >= 0 ? text.slice(0, separatorIndex).trim() : text.trim();
  const changeSegment =
    separatorIndex >= 0 ? text.slice(separatorIndex + 4).trim() : "";

  const target = parseUpdateTargetFilters(targetSegment, currentDate);
  const changes = parseUpdateChanges(changeSegment, currentDate);
  const draft: UpdateEventDraft = {
    ...target,
    ...changes,
    ...(mentionsExplicitTimeChange(text) ? { requiresExplicitTime: true } : {})
  };

  if (!hasUpdateTargetFilters(draft) && !hasUpdateChange(draft)) {
    return null;
  }

  return draft;
}

function parseUpdateTargetFilters(text: string, currentDate: string): UpdateEventDraft {
  const range = resolveDeleteDateRangeFromMessage(text, currentDate);
  const exactDate = range ? null : resolveDeterministicDateFromMessage(text, currentDate);
  const timeData = extractTimeData(text);
  const title = inferFlexibleCreateTitle(text);
  const targetStartTime = normalizeClockTimeValue(timeData.startTime);
  const targetEndTime = normalizeClockTimeValue(timeData.endTime);

  return {
    ...(title ? { targetTitle: title } : {}),
    ...(exactDate?.date ? { targetDate: exactDate.date, targetRawDate: exactDate.raw } : {}),
    ...(range?.dateFrom ? { targetDateFrom: range.dateFrom } : {}),
    ...(range?.dateTo ? { targetDateTo: range.dateTo } : {}),
    ...(range?.raw ? { targetRawDate: range.raw } : {}),
    ...(targetStartTime ? { targetStartTime } : {}),
    ...(targetEndTime ? { targetEndTime } : {})
  };
}

function parseUpdateChanges(text: string, currentDate: string): UpdateEventDraft {
  if (!text.trim()) {
    return {};
  }

  const resolvedDate = resolveDeterministicDateFromMessage(text, currentDate);
  const timeData = extractTimeData(text);
  const newStartTime = normalizeClockTimeValue(timeData.startTime);
  const newEndTime = normalizeClockTimeValue(timeData.endTime);

  return {
    ...(resolvedDate?.date ? { newDate: resolvedDate.date, newRawDate: resolvedDate.raw } : {}),
    ...(newStartTime ? { newStartTime } : {}),
    ...(newEndTime ? { newEndTime } : {}),
    ...(isKeepSameTimePhrase(text) ? { keepTime: true } : {})
  };
}

function splitUpdateClauses(text: string): string[] {
  return text
    .split(
      /\s+e\s+(?=(?:o|a|os|as|um|uma)?\s*(?:reuni(?:ao|oes|Ã£o|Ãµes)|consultas?|almo(?:co|cos)|almoÃ§(?:o|os)|jantares?|cafes?|cafÃ©s?|treinos?|viagens?|dentista|aniversa(?:rio|rios|Ã¡rio|Ã¡rios)|trabalhos?)\b)/iu
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function extractExplicitEventTypeTitlesInOrder(text: string): string[] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const patterns: Array<{ title: string; pattern: RegExp }> = [
    { title: "Reuniao", pattern: /\breunioes?\b/gu },
    { title: "Consulta", pattern: /\bconsultas?\b/gu },
    { title: "Dentista", pattern: /\bdentista\b/gu },
    { title: "Almoco", pattern: /\balmocos?\b/gu },
    { title: "Jantar", pattern: /\bjantares?\b/gu },
    { title: "Cafe", pattern: /\bcafes?\b/gu },
    { title: "Treino", pattern: /\btreinos?\b/gu },
    { title: "Viagem", pattern: /\bviagens?\b/gu },
    { title: "Aniversario", pattern: /\baniversarios?\b/gu },
    { title: "Trabalho", pattern: /\btrabalhos?\b/gu }
  ];

  const matches = patterns.flatMap((entry) =>
    Array.from(normalized.matchAll(entry.pattern)).map((match) => ({
      title: entry.title,
      index: match.index ?? 0
    }))
  );

  return matches
    .sort((a, b) => a.index - b.index)
    .map((match) => match.title)
    .filter((title, index, values) => index === 0 || values[index - 1] !== title);
}

function buildCalendarUpdateItemsFromDrafts(
  drafts: UpdateEventDraft[]
): Array<{
  pageId: string;
  event: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    description?: string;
    category?: string;
  };
}> {
  const updates: Array<{
    pageId: string;
    event: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      description?: string;
      category?: string;
    };
  }> = [];

  for (const draft of drafts) {
    const selectedEvents = getPendingCalendarEvents(draft.selectedEvents);
    for (const event of selectedEvents) {
      const nextDate = draft.newDate ?? event.date;
      let nextStartTime = draft.newStartTime ?? event.startTime;
      let nextEndTime = draft.newEndTime ?? event.endTime;

      if (draft.newStartTime && !draft.newEndTime && event.startTime && event.endTime) {
        const originalDurationMinutes = getClockTimeDurationInMinutes(
          event.startTime,
          event.endTime
        );
        const shiftedEndTime =
          originalDurationMinutes !== null
            ? addMinutesToClockTime(draft.newStartTime, originalDurationMinutes)
            : null;

        if (shiftedEndTime) {
          nextEndTime = shiftedEndTime;
        }
      }

      if (!nextDate || !nextStartTime || !nextEndTime) {
        continue;
      }

      updates.push({
        pageId: event.pageId,
        event: {
          title: event.title,
          date: nextDate,
          startTime: nextStartTime,
          endTime: nextEndTime,
          ...(event.description ? { description: event.description } : {}),
          ...(event.category ? { category: event.category } : {})
        }
      });
    }
  }

  return updates;
}

function buildUpdateReadyReply(
  updateItems: Array<{
    pageId: string;
    event: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      description?: string;
      category?: string;
    };
  }>
): string {
  if (updateItems.length === 1) {
    const update = updateItems[0];
    return `Perfeito. Vou alterar ${update.event.title} para ${formatFriendlyDate(
      update.event.date
    )}, das ${update.event.startTime} as ${update.event.endTime}.`;
  }

  return [
    `Perfeito. Vou alterar ${updateItems.length} eventos:`,
    ...updateItems.map(
      (update, index) =>
        `${index + 1}. ${update.event.title} - ${formatFriendlyDate(update.event.date)} - ${update.event.startTime} as ${update.event.endTime}`
    )
  ].join("\n");
}

function formatUpdateDraftReference(draft: UpdateEventDraft): string {
  const selectedEvents = getPendingCalendarEvents(draft.selectedEvents);
  const matchedEvents = getPendingCalendarEvents(draft.matchedEvents);
  const title =
    selectedEvents[0]?.title ??
    matchedEvents[0]?.title ??
    draft.targetTitle ??
    "o evento";
  const titleLower = title.charAt(0).toLowerCase() + title.slice(1);
  return `${getTitleArticle(titleLower)} ${titleLower}`;
}

function getUpdateDraftArray(value: unknown): UpdateEventDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => Boolean(item) && typeof item === "object")
    .map((item) => normalizeUpdateDraft(item as Record<string, unknown>));
}

function normalizeUpdateDraft(value: Record<string, unknown> | UpdateEventDraft): UpdateEventDraft {
  return {
    ...(typeof value.targetTitle === "string"
      ? { targetTitle: normalizeSentenceCase(value.targetTitle) }
      : {}),
    ...(typeof value.targetDate === "string"
      ? { targetDate: normalizeDateValue(value.targetDate) ?? value.targetDate }
      : {}),
    ...(typeof value.targetRawDate === "string" ? { targetRawDate: value.targetRawDate } : {}),
    ...(typeof value.targetDateFrom === "string"
      ? { targetDateFrom: normalizeDateValue(value.targetDateFrom) ?? value.targetDateFrom }
      : {}),
    ...(typeof value.targetDateTo === "string"
      ? { targetDateTo: normalizeDateValue(value.targetDateTo) ?? value.targetDateTo }
      : {}),
    ...(typeof value.targetStartTime === "string"
      ? { targetStartTime: normalizeClockTimeValue(value.targetStartTime) ?? value.targetStartTime }
      : {}),
    ...(typeof value.targetEndTime === "string"
      ? { targetEndTime: normalizeClockTimeValue(value.targetEndTime) ?? value.targetEndTime }
      : {}),
    ...(typeof value.newDate === "string"
      ? { newDate: normalizeDateValue(value.newDate) ?? value.newDate }
      : {}),
    ...(typeof value.newRawDate === "string" ? { newRawDate: value.newRawDate } : {}),
    ...(typeof value.newStartTime === "string"
      ? { newStartTime: normalizeClockTimeValue(value.newStartTime) ?? value.newStartTime }
      : {}),
    ...(typeof value.newEndTime === "string"
      ? { newEndTime: normalizeClockTimeValue(value.newEndTime) ?? value.newEndTime }
      : {}),
    ...(typeof value.keepTime === "boolean" ? { keepTime: value.keepTime } : {}),
    ...(typeof value.requiresExplicitTime === "boolean"
      ? { requiresExplicitTime: value.requiresExplicitTime }
      : {}),
    ...(Array.isArray(value.matchedEvents)
      ? { matchedEvents: getPendingCalendarEvents(value.matchedEvents) }
      : {}),
    ...(Array.isArray(value.selectedEvents)
      ? { selectedEvents: getPendingCalendarEvents(value.selectedEvents) }
      : {})
  };
}

function sanitizeUpdateExtractedData(
  extractedData: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...extractedData };
  const allowedKeys = new Set(["updateItems"]);
  return Object.fromEntries(
    Object.entries(next).filter(([key]) => allowedKeys.has(key))
  );
}

function getCalendarUpdateItems(
  value: unknown
): Array<{
  pageId: string;
  event: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    description?: string;
    category?: string;
  };
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is {
    pageId: string;
    event: {
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      description?: string;
      category?: string;
    };
  } => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const record = item as Record<string, unknown>;
    const event = record.event as Record<string, unknown> | undefined;
    return (
      typeof record.pageId === "string" &&
      record.pageId.trim().length > 0 &&
      Boolean(event) &&
      typeof event?.title === "string" &&
      typeof event?.date === "string" &&
      typeof event?.startTime === "string" &&
      typeof event?.endTime === "string"
    );
  });
}

function hasUpdateTargetFilters(draft: UpdateEventDraft): boolean {
  return Boolean(
    draft.targetTitle ||
      draft.targetDate ||
      draft.targetDateFrom ||
      draft.targetDateTo ||
      draft.targetStartTime ||
      draft.targetEndTime
  );
}

function hasUpdateChange(draft: Partial<UpdateEventDraft>): boolean {
  return Boolean(
    draft.newDate ||
      draft.newStartTime ||
      draft.newEndTime ||
      draft.keepTime ||
      draft.requiresExplicitTime
  );
}

function draftNeedsKeepTimeDecision(draft: UpdateEventDraft): boolean {
  return Boolean(
    draft.newDate &&
      !draft.requiresExplicitTime &&
      !draft.keepTime &&
      !draft.newStartTime &&
      !draft.newEndTime &&
      getPendingCalendarEvents(draft.selectedEvents).length > 0
  );
}

function draftNeedsExplicitTimeInput(draft: UpdateEventDraft): boolean {
  return Boolean(
    draft.requiresExplicitTime &&
      !draft.keepTime &&
      !draft.newStartTime &&
      !draft.newEndTime &&
      getPendingCalendarEvents(draft.selectedEvents).length > 0
  );
}

function stripUpdateLeadVerb(text: string): string {
  return text
    .replace(
      /^(?:ola\s+)?(?:quero\s+|queria\s+|preciso\s+)?(?:altera|alterar|muda|mudar|reagenda|reagendar|passa|passar|adiar|adia|move|mover)\s+/iu,
      ""
    )
    .trim();
}

function mentionsExplicitTimeChange(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:hora|horario)\b/u.test(normalized);
}

function looksLikeCreateEventIntent(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:(?:queria|quero|preciso|gostaria)\s+(?:de\s+)?(?:marcar|agendar|criar|adicionar)|(?:vamos\s+)?(?:marcar|agendar|criar|adicionar)\b|(?:marca|marque|agenda|agende|cria|crie|adiciona|adicione)\b)\b/u.test(
    normalized
  );
}

function detectCreateEventIntent(rawText: string, normalizedText?: string): boolean {
  return (
    looksLikeCreateEventIntent(rawText) ||
    (typeof normalizedText === "string" && looksLikeCreateEventIntent(normalizedText))
  );
}

function looksLikeUpdateEventIntent(text: string): boolean {
  const normalized = normalizeLooseText(text);
  if (
    /\b(?:altera|alterar|muda|mudar|reagenda|reagendar|passa|passar|adia|adiar|move|mover)\b/u.test(
      normalized
    )
  ) {
    return true;
  }

  const candidateTokens = normalized
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 5);
  const updateVerbs = [
    "altera",
    "alterar",
    "muda",
    "mudar",
    "reagenda",
    "reagendar",
    "passa",
    "passar",
    "adia",
    "adiar",
    "move",
    "mover"
  ];

  return candidateTokens.some((token) =>
    updateVerbs.some(
      (verb) =>
        token.length >= 4 &&
        token[0] === verb[0] &&
        Math.abs(token.length - verb.length) <= 1 &&
        getLevenshteinDistance(token, verb) <= 1
    )
  );
}

function detectUpdateEventIntent(rawText: string, normalizedText?: string): boolean {
  return (
    looksLikeUpdateEventIntent(rawText) ||
    (typeof normalizedText === "string" && looksLikeUpdateEventIntent(normalizedText))
  );
}

function getLevenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}

function isKeepSameTimePhrase(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\bmesma\s+hora\b|\bmesmas\s+horas\b/u.test(normalized);
}

function isAllDayPhrase(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:dia\s+todo|todo\s+o\s+dia|o\s+dia\s+todo|all\s+day)\b/u.test(normalized);
}

function shouldHandleListEvents(
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  normalizedMessageContent?: string
): boolean {
  const sourceText = normalizedMessageContent ?? "";
  if (
    interpretation.command === "create_event" ||
    interpretation.command === "update_event" ||
    interpretation.command === "delete_event"
  ) {
    return false;
  }

  if (
    pending?.command !== "list_events" &&
    (detectCreateEventIntent(sourceText) ||
      looksLikeUpdateEventIntent(sourceText) ||
      /\bapaga(?:r)?\b/u.test(normalizeLooseText(sourceText)))
  ) {
    return false;
  }

  return (
    interpretation.command === "list_events" ||
    pending?.command === "list_events" ||
    looksLikeListEventsIntent(sourceText)
  );
}

async function resolveListEventsInterpretation(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  options: MessageProcessingOptions,
  normalizedMessageContent?: string,
  history: ConversationMessage[] = []
): Promise<LlmInterpretation> {
  const originalText = message.content.trim();
  const normalizedText = normalizedMessageContent?.trim() || "";
  const rawQuery =
    resolveListEventsQuery(originalText) ??
    inferListEventsQueryFromRecentContext(originalText, history) ??
    inferListEventsQueryFromPendingReply(originalText, pending);
  const shouldUseNormalizedFallback =
    normalizedText.length > 0 &&
    normalizedText !== originalText &&
    !looksLikeIncompleteListPeriodReference(originalText);
  const normalizedQuery = shouldUseNormalizedFallback
    ? resolveListEventsQuery(normalizedText) ??
      inferListEventsQueryFromRecentContext(normalizedText, history) ??
      inferListEventsQueryFromPendingReply(normalizedText, pending)
    : null;
  const query = rawQuery ?? normalizedQuery;

  if (!query) {
    const acknowledgementReply = buildAcknowledgementReply(originalText);
    const naturalReply = buildNaturalChatReply(originalText, message.timestamp);

    if (acknowledgementReply || naturalReply) {
      return {
        ...interpretation,
        command: "chat",
        hasCommand: false,
        isComplete: true,
        needsCalendarAction: false,
        shouldAskFollowUp: false,
        missingFields: [],
        followUpQuestion: "",
        reply: acknowledgementReply ?? naturalReply ?? interpretation.reply,
        extractedData: {}
      };
    }

    return {
      ...interpretation,
      command: "list_events",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["listPeriod"],
      followUpQuestion:
        "Que periodo queres ver? Podes dizer hoje, amanha, ate ao final da semana, este mes ou o proximo mes.",
      reply:
        "Que periodo queres ver? Podes dizer hoje, amanha, ate ao final da semana, este mes ou o proximo mes.",
      extractedData: {
        summaryMode: isListSummaryRequest(originalText) || isListSummaryRequest(normalizedText)
      }
    };
  }

  const events = await searchCalendarEvents(
    message,
    {
      ...(query.title ? { title: query.title } : {}),
      ...(query.date ? { date: query.date } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      limit: query.limit ?? 100
    },
    options
  );

  return {
    ...interpretation,
    command: "list_events",
    hasCommand: true,
    isComplete: true,
    needsCalendarAction: false,
    shouldAskFollowUp: false,
    missingFields: [],
    followUpQuestion: "",
    reply:
      events.length === 0 ? buildListNoResultsReply(query) : buildListEventsReply(events, query),
    extractedData: {
      ...(query.title ? { title: query.title } : {}),
      ...(query.date ? { date: query.date } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      ...(query.rawPeriod ? { rawPeriod: query.rawPeriod } : {}),
      ...(query.summaryMode ? { summaryMode: true } : {}),
      events
    }
  };
}

function looksLikeIncompleteListPeriodReference(text: string): boolean {
  const normalized = normalizeLooseText(text);
  if (
    !/\b(?:este|esta|deste|desta|neste|nesta|nesse|nessa|proximo|proxima|seguinte)\b/u.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    /\b(?:mes|semana|hoje|amanha|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u.test(
      normalized
    )
  ) {
    return false;
  }

  return /^(?:e\s+)?(?:o\s+que\s+tenho(?:\s+marcado)?\s+)?(?:para\s+)?(?:este|esta|deste|desta|neste|nesta|nesse|nessa|proximo|proxima|seguinte)\b/u.test(
    normalized
  );
}

function resolveListEventsQuery(text: string): ListEventsQuery | null {
  const currentDate = getTimeContext().currentDate;
  const normalized = normalizeLooseText(text);
  const today = parseIsoDate(currentDate);
  const summaryMode = isListSummaryRequest(text);
  const range = resolveListDateRangeFromMessage(text, currentDate);
  const exactDate = range ? null : resolveDeterministicDateFromMessage(text, currentDate);

  if (exactDate?.date) {
    return {
      date: exactDate.date,
      rawPeriod: exactDate.raw,
      summaryMode,
      grouping: "day"
    };
  }

  if (range) {
    const sameMonth =
      parseIsoDate(range.dateFrom).getUTCMonth() === parseIsoDate(range.dateTo).getUTCMonth() &&
      parseIsoDate(range.dateFrom).getUTCFullYear() === parseIsoDate(range.dateTo).getUTCFullYear();
    return {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      rawPeriod: range.raw,
      summaryMode,
      grouping: sameMonth ? "week" : "day"
    };
  }

  if (/\b(?:este|deste|neste|nesse)\s+mes\b|\bmes\s+(?:atual|corrente)\b/u.test(normalized)) {
    const monthRange = getMonthRange(today.getUTCFullYear(), today.getUTCMonth());
    return {
      dateFrom: formatIsoDate(monthRange.start),
      dateTo: formatIsoDate(monthRange.end),
      rawPeriod: "este mes",
      summaryMode,
      grouping: "week"
    };
  }

  if (
    /\b(?:proximo|do proximo|no proximo)\s+mes\b|\bmes\s+que\s+vem\b|\bmes\s+a\s+seguir\b/u.test(
      normalized
    )
  ) {
    const nextMonthRange = getMonthRange(today.getUTCFullYear(), today.getUTCMonth() + 1);
    return {
      dateFrom: formatIsoDate(nextMonthRange.start),
      dateTo: formatIsoDate(nextMonthRange.end),
      rawPeriod: "proximo mes",
      summaryMode,
      grouping: "week"
    };
  }

  return null;
}

function inferListEventsQueryFromRecentContext(
  text: string,
  history: ConversationMessage[]
): ListEventsQuery | null {
  const normalized = normalizeLooseText(text);
  const currentDate = getTimeContext().currentDate;
  const today = parseIsoDate(currentDate);
  const summaryMode = isListSummaryRequest(text);

  const currentGenericFollowUp =
    /^(?:e\s+)?(?:para\s+)?(?:este|esta|deste|desta|neste|nesta|nesse|nessa)\b/u.test(normalized);
  const nextGenericFollowUp =
    /^(?:e\s+)?(?:para\s+)?(?:(?:o|a|no|na)\s+)?(?:proximo|proxima|do\s+proximo|da\s+proxima)\b/u.test(
      normalized
    );
  const currentMonthFollowUp = currentGenericFollowUp;
  const nextMonthFollowUp = nextGenericFollowUp;
  const currentWeekFollowUp = currentGenericFollowUp;
  const nextWeekFollowUp = nextGenericFollowUp;

  if (
    !currentMonthFollowUp &&
    !nextMonthFollowUp &&
    !currentWeekFollowUp &&
    !nextWeekFollowUp
  ) {
    return null;
  }

  const recentText = history
    .slice(-4)
    .map((item) => normalizeLooseText(item.content))
    .join("\n");

  const recentMentionsMonth = /\bmes\b/u.test(recentText);
  const recentMentionsWeek = /\bsemana\b/u.test(recentText);

  if ((currentMonthFollowUp || nextMonthFollowUp) && recentMentionsMonth) {
    const monthOffset = nextMonthFollowUp ? 1 : 0;
    const range = getMonthRange(today.getUTCFullYear(), today.getUTCMonth() + monthOffset);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: monthOffset === 0 ? "este mes" : "proximo mes",
      summaryMode,
      grouping: "week"
    };
  }

  if ((currentWeekFollowUp || nextWeekFollowUp) && recentMentionsWeek) {
    const weekOffset = nextWeekFollowUp ? 1 : 0;
    const range = getWeekRange(today, weekOffset);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: weekOffset === 0 ? "esta semana" : "proxima semana",
      summaryMode,
      grouping: "day"
    };
  }

  return null;
}

function inferListEventsQueryFromPendingReply(
  text: string,
  pending: PendingCommand | null
): ListEventsQuery | null {
  if (pending?.command !== "list_events") {
    return null;
  }

  const normalized = normalizeLooseText(text);
  const previousMessage = normalizeLooseText(pending.lastUserMessage ?? "");
  const followUpQuestion = normalizeLooseText(pending.followUpQuestion ?? "");
  const currentDate = getTimeContext().currentDate;
  const today = parseIsoDate(currentDate);
  const summaryMode =
    isListSummaryRequest(text) ||
    (pending.extractedData?.summaryMode === true);

  const previousMessageSuggestsCurrentMonth = /\b(?:este|deste|neste|nesse)\b/u.test(previousMessage);
  const previousMessageSuggestsNextMonth = /\b(?:proximo|proxima|seguinte)\b/u.test(previousMessage);
  const previousMessageSuggestsCurrentWeek = /\b(?:esta|desta|nesta|nessa)\b/u.test(previousMessage);
  const previousMessageSuggestsNextWeek = /\b(?:proxima|seguinte)\b/u.test(previousMessage);
  const previousSuggestsCurrentMonth =
    previousMessageSuggestsCurrentMonth || /\b(?:este|deste|neste|nesse)\b/u.test(followUpQuestion);
  const previousSuggestsNextMonth =
    previousMessageSuggestsNextMonth || /\b(?:proximo|proxima|seguinte)\b/u.test(followUpQuestion);
  const previousSuggestsCurrentWeek =
    previousMessageSuggestsCurrentWeek || /\b(?:esta|desta|nesta|nessa)\b/u.test(followUpQuestion);
  const previousSuggestsNextWeek =
    previousMessageSuggestsNextWeek || /\b(?:proxima|seguinte)\b/u.test(followUpQuestion);

  if (/^(?:o\s+)?mes$/u.test(normalized)) {
    const monthOffset = previousMessageSuggestsNextMonth ? 1 : 0;
    const range = getMonthRange(today.getUTCFullYear(), today.getUTCMonth() + monthOffset);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: monthOffset === 0 ? "este mes" : "proximo mes",
      summaryMode,
      grouping: "week"
    };
  }

  if (/^(?:a\s+)?semana$/u.test(normalized)) {
    const weekOffset = previousMessageSuggestsNextWeek ? 1 : 0;
    const range = getWeekRange(today, weekOffset);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: weekOffset === 0 ? "esta semana" : "proxima semana",
      summaryMode,
      grouping: "day"
    };
  }

  if (/^(?:este|deste|neste|nesse)\b/u.test(normalized) && previousSuggestsCurrentMonth) {
    const range = getMonthRange(today.getUTCFullYear(), today.getUTCMonth());
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: "este mes",
      summaryMode,
      grouping: "week"
    };
  }

  if (/^(?:esta|desta|nesta|nessa)\b/u.test(normalized) && previousSuggestsCurrentWeek) {
    const range = getWeekRange(today, 0);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      rawPeriod: "esta semana",
      summaryMode,
      grouping: "day"
    };
  }

  return null;
}

function resolveListDateRangeFromMessage(
  text: string,
  currentDate: string
): { dateFrom: string; dateTo: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const today = parseIsoDate(currentDate);

  if (
    /\bate\s+(?:ao\s+)?(?:final|fim)\s+da\s+semana\b/u.test(normalized) ||
    /\bate\s+domingo\b/u.test(normalized)
  ) {
    const endOfWeek = getWeekRange(today, 0).end;
    return {
      dateFrom: currentDate,
      dateTo: formatIsoDate(endOfWeek),
      raw: "ate ao final da semana"
    };
  }

  if (/\b(?:esta|desta|deste)\s+semana\b/u.test(normalized)) {
    const weekRange = getWeekRange(today, 0);
    return {
      dateFrom: formatIsoDate(weekRange.start),
      dateTo: formatIsoDate(weekRange.end),
      raw: "esta semana"
    };
  }

  if (/\b(?:proxima|da proxima)\s+semana\b|\b(?:para|pra)\s+a\s+semana\b|\bsemana\s+que\s+vem\b/u.test(normalized)) {
    const weekRange = getWeekRange(today, 1);
    return {
      dateFrom: formatIsoDate(weekRange.start),
      dateTo: formatIsoDate(weekRange.end),
      raw: "proxima semana"
    };
  }

  return null;
}

function buildListNoResultsReply(query: ListEventsQuery): string {
  if (query.rawPeriod) {
    return `Nao tens eventos marcados para ${query.rawPeriod}.`;
  }

  return "Nao encontrei eventos para esse periodo.";
}

function buildListEventsReply(events: CalendarEventSummary[], query: ListEventsQuery): string {
  const sortedEvents = [...events].sort(compareCalendarEventsByDateTime);
  const periodLabel = query.rawPeriod ?? "esse periodo";

  if (query.date) {
    return [
      `Tens ${sortedEvents.length} ${sortedEvents.length === 1 ? "evento" : "eventos"} marcado${
        sortedEvents.length === 1 ? "" : "s"
      } para ${periodLabel}:`,
      ...sortedEvents.map((event, index) =>
        `${index + 1}. ${formatListEventLine(event, { compact: query.summaryMode === true })}`
      )
    ].join("\n");
  }

  const groupByWeek = query.grouping === "week";
  const sections = groupByWeek
    ? buildWeeklyListSections(sortedEvents, query.summaryMode === true)
    : buildDailyListSections(sortedEvents, query.summaryMode === true);

  return [
    `${query.summaryMode ? "Resumo" : "Eventos"} para ${periodLabel}:`,
    ...sections
  ].join("\n");
}

function buildDailyListSections(events: CalendarEventSummary[], compact: boolean): string[] {
  const sections: string[] = [];
  let currentDate: string | null = null;

  for (const event of events) {
    if (event.date !== currentDate) {
      currentDate = event.date;
      sections.push(formatFriendlyDate(event.date));
    }

    sections.push(`  - ${formatListEventLine(event, { compact })}`);
  }

  return sections;
}

function buildWeeklyListSections(events: CalendarEventSummary[], compact: boolean): string[] {
  const sections: string[] = [];
  let currentWeekKey: string | null = null;
  let currentDate: string | null = null;

  for (const event of events) {
    const weekRange = getWeekRange(parseIsoDate(event.date), 0);
    const weekKey = `${formatIsoDate(weekRange.start)}_${formatIsoDate(weekRange.end)}`;

    if (weekKey !== currentWeekKey) {
      currentWeekKey = weekKey;
      currentDate = null;
      sections.push(
        `Semana de ${formatShortDate(formatIsoDate(weekRange.start))} a ${formatShortDate(formatIsoDate(weekRange.end))}`
      );
    }

    if (event.date !== currentDate) {
      currentDate = event.date;
      sections.push(`  ${formatFriendlyDate(event.date)}`);
    }

    sections.push(`    - ${formatListEventLine(event, { compact })}`);
  }

  return sections;
}

function formatListEventLine(
  event: CalendarEventSummary,
  options: { compact: boolean }
): string {
  if (event.allDay || (!event.startTime && !event.endTime)) {
    if (options.compact) {
      return event.title;
    }

    let line = event.title;
    if (event.endDate && event.endDate !== event.date) {
      line += ` - ${formatFriendlyDate(event.date)} a ${formatFriendlyDate(event.endDate)}`;
    } else {
      line += " - dia todo";
    }

    if (event.description) {
      line += ` - ${event.description}`;
    }

    return line;
  }

  if (options.compact) {
    if (event.startTime) {
      return `${event.startTime} - ${event.title}`;
    }

    return event.title;
  }

  let line = event.title;
  if (event.startTime && event.endTime) {
    line += ` - ${event.startTime} as ${event.endTime}`;
  } else if (event.startTime) {
    line += ` - ${event.startTime}`;
  }

  if (event.description) {
    line += ` - ${event.description}`;
  }

  return line;
}

function compareCalendarEventsByDateTime(
  left: CalendarEventSummary,
  right: CalendarEventSummary
): number {
  if (left.date !== right.date) {
    return left.date.localeCompare(right.date);
  }

  const leftTime = left.startTime ?? "99:99";
  const rightTime = right.startTime ?? "99:99";
  return leftTime.localeCompare(rightTime);
}

function isListSummaryRequest(text: string): boolean {
  return /\bresumo\b/u.test(normalizeLooseText(text));
}

function looksLikeListEventsIntent(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:o\s+que\s+tenho|que\s+tenho\s+marcado|mostra(?:-me)?|lista(?:-me)?|ver\s+eventos|resumo)\b/u.test(
    normalized
  );
}

function isLikelyListPeriodOnlyReply(text: string): boolean {
  const normalized = normalizeLooseText(text);
  const looksLikeCreateIntent = detectCreateEventIntent(text, normalized);

  if (
    !resolveListEventsQuery(text) &&
    !/^(?:e\s+)?(?:para\s+)?(?:este|deste|o\s+proximo|do\s+proximo|esta|desta|a\s+proxima|da\s+proxima)\b/u.test(
      normalized
    )
  ) {
    return false;
  }

  return (
    normalized.length <= 80 &&
    !looksLikeCreateIntent &&
    !looksLikeUpdateEventIntent(normalized) &&
    !/\bapaga(?:r)?\b/u.test(normalized)
  );
}

function historySuggestsRecentListEventsConversation(
  history: ConversationMessage[]
): boolean {
  const recent = history.slice(-4);

  return recent.some((message) => {
    const normalized = normalizeLooseText(message.content);

    if (message.role === "user") {
      return looksLikeListEventsIntent(message.content) || isLikelyListPeriodOnlyReply(message.content);
    }

    return (
      /\bnao tens eventos marcados para\b/u.test(normalized) ||
      /\btens\s+\d+\s+eventos?\s+marcados?\s+para\b/u.test(normalized) ||
      /\beventos para\b/u.test(normalized) ||
      /\bresumo para\b/u.test(normalized) ||
      /\bque periodo queres ver\b/u.test(normalized)
    );
  });
}

function shouldContinueRecentListEventsContext(
  text: string,
  history: ConversationMessage[],
  pending: PendingCommand | null
): boolean {
  if (pending?.command === "list_events") {
    return false;
  }

  if (
    detectCreateEventIntent(text) ||
    looksLikeUpdateEventIntent(text) ||
    /\bapaga(?:r)?\b/u.test(normalizeLooseText(text))
  ) {
    return false;
  }

  return isLikelyListPeriodOnlyReply(text) && historySuggestsRecentListEventsConversation(history);
}

function shouldHandleDeleteEvent(
  interpretation: LlmInterpretation,
  pending: PendingCommand | null
): boolean {
  return interpretation.command === "delete_event" || pending?.command === "delete_event";
}

async function resolveDeleteEventInterpretation(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null,
  options: MessageProcessingOptions
): Promise<LlmInterpretation> {
  const extractedData = sanitizeDeleteExtractedData(interpretation.extractedData);

  if (pending?.command === "delete_event" && pending.missingFields.includes("deleteSelection")) {
    return resolveDeleteSelectionReply(message.content, interpretation, extractedData, pending);
  }

  if (pending?.command === "delete_event" && pending.missingFields.includes("deleteConfirmation")) {
    return resolveDeleteConfirmationReply(message.content, interpretation, extractedData, pending);
  }

  const queries = resolveDeleteSearchQueries(message.content, interpretation);

  if (queries.length === 0) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["deleteTarget"],
      followUpQuestion: "Que evento queres eliminar? Diz-me pelo menos o nome ou o dia.",
      reply: "Que evento queres eliminar? Diz-me pelo menos o nome ou o dia.",
      extractedData
    };
  }

  const searchResults = await Promise.all(
    queries.map(async (query) => ({
      query,
      events: await searchCalendarEvents(
        message,
        {
          title: query.title,
          date: query.date,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          startTime: query.startTime,
          endTime: query.endTime,
          limit: query.limit ?? 100
        },
        options
      )
    }))
  );

  const matchedEvents = dedupeCalendarEvents(
    searchResults.flatMap((result) => result.events)
  );
  const deleteAllRequested = queries.some((query) => query.deleteAllRequested);
  const primaryQuery = queries[0];

  const nextExtractedData: Record<string, unknown> = {
    ...extractedData,
    ...(primaryQuery?.title ? { title: primaryQuery.title } : {}),
    ...(primaryQuery?.date ? { date: primaryQuery.date } : {}),
    ...(primaryQuery?.rawDate ? { rawDate: primaryQuery.rawDate } : {}),
    ...(primaryQuery?.dateFrom ? { dateFrom: primaryQuery.dateFrom } : {}),
    ...(primaryQuery?.dateTo ? { dateTo: primaryQuery.dateTo } : {}),
    ...(primaryQuery?.startTime ? { startTime: primaryQuery.startTime } : {}),
    ...(primaryQuery?.endTime ? { endTime: primaryQuery.endTime } : {}),
    matchedEvents,
    deleteAllRequested
  };

  if (matchedEvents.length === 0) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: buildDeleteNoResultsReply(primaryQuery?.title, primaryQuery?.rawDate ?? primaryQuery?.date),
      extractedData: nextExtractedData
    };
  }

  const shouldAutoSelectAllMatches =
    matchedEvents.length === 1 || deleteAllRequested || queries.length > 1;

  if (shouldAutoSelectAllMatches) {
    return buildDeleteConfirmationInterpretation(
      interpretation,
      nextExtractedData,
      matchedEvents,
      matchedEvents
    );
  }

  return {
    ...interpretation,
    command: "delete_event",
    hasCommand: true,
    isComplete: false,
    needsCalendarAction: false,
    shouldAskFollowUp: true,
    missingFields: ["deleteSelection"],
    followUpQuestion: buildDeleteSelectionQuestion(matchedEvents),
    reply: buildDeleteSelectionQuestion(matchedEvents),
    extractedData: nextExtractedData
  };
}

function resolveDeleteSelectionReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  extractedData: Record<string, unknown>,
  pending: PendingCommand
): LlmInterpretation {
  const matchedEvents = getPendingCalendarEvents(pending.extractedData.matchedEvents);
  if (matchedEvents.length === 0) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Perdi a referencia aos eventos candidatos. Pede-me novamente o que queres apagar.",
      extractedData
    };
  }

  const refinedSelection = selectDeleteEventsFromText(latestMessage, matchedEvents);
  if (refinedSelection.usedSelection) {
    if (refinedSelection.events.length === 0) {
      return {
        ...interpretation,
        command: "delete_event",
        hasCommand: true,
        isComplete: false,
        needsCalendarAction: false,
        shouldAskFollowUp: true,
        missingFields: ["deleteSelection"],
        followUpQuestion: buildDeleteSelectionQuestion(matchedEvents),
        reply: `${buildDeleteSelectionQuestion(matchedEvents)}\nNao percebi quais desses queres apagar. Podes usar numeros, dias, horas, titulos ou ambos.`,
        extractedData: {
          ...extractedData,
          matchedEvents
        }
      };
    }

    return buildDeleteConfirmationInterpretation(
      interpretation,
      {
        ...extractedData,
        matchedEvents
      },
      matchedEvents,
      refinedSelection.events
    );
  }

  if (isNegativePhrase(latestMessage)) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Tudo bem, nao apaguei nada.",
      extractedData
    };
  }

  const selection = parseDeleteSelection(latestMessage, matchedEvents.length);
  if (!selection.selectAll && selection.indexes.length === 0) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["deleteSelection"],
      followUpQuestion: buildDeleteSelectionQuestion(matchedEvents),
      reply: `${buildDeleteSelectionQuestion(matchedEvents)}\nPodes responder 1, 2, primeira, segunda ou ambos.`,
      extractedData: {
        ...extractedData,
        matchedEvents
      }
    };
  }

  const selectedEvents = selection.selectAll
    ? matchedEvents
    : matchedEvents.filter((_, index) => selection.indexes.includes(index + 1));

  return buildDeleteConfirmationInterpretation(
    interpretation,
    {
      ...extractedData,
      matchedEvents
    },
    matchedEvents,
    selectedEvents
  );
}

function resolveDeleteConfirmationReply(
  latestMessage: string,
  interpretation: LlmInterpretation,
  extractedData: Record<string, unknown>,
  pending: PendingCommand
): LlmInterpretation {
  const selectedEvents = getPendingCalendarEvents(pending.extractedData.selectedEvents);
  const matchedEvents = getPendingCalendarEvents(pending.extractedData.matchedEvents);

  if (selectedEvents.length === 0) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Perdi a referencia aos eventos a apagar. Pede-me novamente o que queres eliminar.",
      extractedData
    };
  }

  const refinedSelection = selectDeleteEventsFromText(latestMessage, matchedEvents);
  if (refinedSelection.usedSelection) {
    if (refinedSelection.events.length === 0) {
      return {
        ...interpretation,
        command: "delete_event",
        hasCommand: true,
        isComplete: false,
        needsCalendarAction: false,
        shouldAskFollowUp: true,
        missingFields: ["deleteConfirmation"],
        followUpQuestion: buildDeleteConfirmationQuestion(selectedEvents),
        reply: `${buildDeleteSelectionQuestion(matchedEvents)}\nSe quiseres filtrar, podes responder com numeros, titulos, dias ou horas.`,
        extractedData: {
          ...extractedData,
          matchedEvents,
          selectedEvents
        }
      };
    }

    return buildDeleteConfirmationInterpretation(
      interpretation,
      {
        ...extractedData,
        matchedEvents
      },
      matchedEvents,
      refinedSelection.events
    );
  }

  if (isAffirmativePhrase(latestMessage)) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: true,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply:
        selectedEvents.length === 1
          ? `Perfeito. Vou apagar ${formatCalendarEventSummary(selectedEvents[0])}.`
          : `Perfeito. Vou apagar ${selectedEvents.length} eventos.`,
      extractedData: {
        ...extractedData,
        matchedEvents,
        selectedEvents,
        selectedPageIds: selectedEvents.map((event) => event.pageId)
      }
    };
  }

  if (isNegativePhrase(latestMessage)) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: true,
      needsCalendarAction: false,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: "Tudo bem, nao apaguei nada.",
      extractedData: {
        ...extractedData,
        matchedEvents,
        selectedEvents
      }
    };
  }

  if (messageSuggestsDeleteSubsetRefinement(latestMessage)) {
    return {
      ...interpretation,
      command: "delete_event",
      hasCommand: true,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["deleteConfirmation"],
      followUpQuestion: buildDeleteConfirmationQuestion(selectedEvents),
      reply: `${buildDeleteSelectionQuestion(matchedEvents)}\nPodes dizer, por exemplo, 'so o 1 e 3', 'so a reuniao de segunda as 10' ou 'ambos'.`,
      extractedData: {
        ...extractedData,
        matchedEvents,
        selectedEvents
      }
    };
  }

  return {
    ...interpretation,
    command: "delete_event",
    hasCommand: true,
    isComplete: false,
    needsCalendarAction: false,
    shouldAskFollowUp: true,
    missingFields: ["deleteConfirmation"],
    followUpQuestion: buildDeleteConfirmationQuestion(selectedEvents),
    reply: `${buildDeleteConfirmationQuestion(selectedEvents)}\nPodes responder sim ou nao.`,
    extractedData: {
      ...extractedData,
      matchedEvents,
      selectedEvents
    }
  };
}

function buildDeleteConfirmationInterpretation(
  interpretation: LlmInterpretation,
  extractedData: Record<string, unknown>,
  matchedEvents: CalendarEventSummary[],
  selectedEvents: CalendarEventSummary[]
): LlmInterpretation {
  return {
    ...interpretation,
    command: "delete_event",
    hasCommand: true,
    isComplete: false,
    needsCalendarAction: false,
    shouldAskFollowUp: true,
    missingFields: ["deleteConfirmation"],
    followUpQuestion: buildDeleteConfirmationQuestion(selectedEvents),
    reply: buildDeleteConfirmationQuestion(selectedEvents),
    extractedData: {
      ...extractedData,
      matchedEvents,
      selectedEvents,
      selectedPageIds: selectedEvents.map((event) => event.pageId)
    }
  };
}

function buildDeleteSelectionQuestion(events: CalendarEventSummary[]): string {
  return [
    `Encontrei ${events.length} eventos que batem certo:`,
    ...events.map((event, index) => `${index + 1}. ${formatCalendarEventSummary(event)}`),
    "Qual queres apagar? Podes responder 1, 2, primeira, segunda, ambos ou filtrar por dia, hora e titulo."
  ].join("\n");
}

function buildDeleteConfirmationQuestion(events: CalendarEventSummary[]): string {
  if (events.length === 1) {
    return [
      "Encontrei este evento para apagar:",
      `1. ${formatCalendarEventSummary(events[0])}`,
      "Queres mesmo apagar este evento?"
    ].join("\n");
  }

  return [
    `Encontrei ${events.length} eventos para apagar:`,
    ...events.map((event, index) => `${index + 1}. ${formatCalendarEventSummary(event)}`),
    "Queres mesmo apagar todos estes eventos?"
  ].join("\n");
}

function formatCalendarEventSummary(event: CalendarEventSummary): string {
  const dateLabel = formatCalendarDateWindow(event);
  let summary = `${event.title} - ${dateLabel}`;

  if (event.allDay || (!event.startTime && !event.endTime)) {
    summary += " - dia todo";
  } else if (event.startTime && event.endTime) {
    summary += ` - ${event.startTime} as ${event.endTime}`;
  } else if (event.startTime) {
    summary += ` - ${event.startTime}`;
  }

  if (event.description) {
    summary += ` - ${event.description}`;
  }

  return summary;
}

function formatCalendarDateWindow(event: CalendarEventSummary): string {
  if (event.endDate && event.endDate !== event.date) {
    return `${formatFriendlyDate(event.date)} a ${formatFriendlyDate(event.endDate)}`;
  }

  return formatFriendlyDate(event.date);
}

function buildDeleteNoResultsReply(title?: string, rawDate?: string): string {
  if (title && rawDate) {
    return `Nao encontrei nenhum evento chamado ${title} para ${rawDate}.`;
  }
  if (title) {
    return `Nao encontrei nenhum evento chamado ${title}.`;
  }
  if (rawDate) {
    return `Nao encontrei eventos para ${rawDate}.`;
  }

  return "Nao encontrei nenhum evento que bata certo com esse pedido.";
}

function resolveDeleteSearchQueries(
  messageText: string,
  interpretation: LlmInterpretation
): DeleteSearchQuery[] {
  const clauses = splitDeleteClauses(messageText);
  const queries = clauses
    .map((clause, index) =>
      resolveSingleDeleteSearchQuery(
        clause,
        interpretation,
        index === 0 && clauses.length === 1
      )
    )
    .filter((query): query is DeleteSearchQuery => query !== null);

  if (queries.length > 0) {
    return dedupeDeleteSearchQueries(queries);
  }

  const fallbackQuery = resolveSingleDeleteSearchQuery(messageText, interpretation, true);
  return fallbackQuery ? [fallbackQuery] : [];
}

function resolveSingleDeleteSearchQuery(
  text: string,
  interpretation: LlmInterpretation,
  allowInterpretationFallback: boolean
): DeleteSearchQuery | null {
  const currentDate = getTimeContext().currentDate;
  const range = resolveDeleteDateRangeFromMessage(text, currentDate);
  const exactDate = range ? null : resolveDeterministicDateFromMessage(text, currentDate);
  const timeData = extractTimeData(text);
  const startTime = normalizeClockTimeValue(timeData.startTime);
  const endTime = normalizeClockTimeValue(timeData.endTime);
  const inferredTitle =
    inferExplicitEventTypeTitle(text) ??
    inferUnknownEventTitle(text) ??
    (allowInterpretationFallback ? resolveDeleteTitleCandidate(interpretation, text) : null);

  const query: DeleteSearchQuery = {
    ...(inferredTitle ? { title: inferredTitle } : {}),
    ...(exactDate?.date ? { date: normalizeDateValue(exactDate.date) ?? exactDate.date } : {}),
    ...(exactDate?.raw ? { rawDate: exactDate.raw } : {}),
    ...(range?.dateFrom ? { dateFrom: range.dateFrom } : {}),
    ...(range?.dateTo ? { dateTo: range.dateTo } : {}),
    ...(range?.raw ? { rawDate: range.raw } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    deleteAllRequested: isDeleteAllRequest(text)
  };

  if (
    !query.title &&
    !query.date &&
    !query.dateFrom &&
    !query.dateTo &&
    !query.startTime &&
    !query.endTime &&
    !query.deleteAllRequested
  ) {
    return null;
  }

  return query;
}

function resolveDeleteDateRangeFromMessage(
  text: string,
  currentDate: string
): { dateFrom: string; dateTo: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const today = parseIsoDate(currentDate);

  if (/\b(?:esta|desta|deste)\s+semana\b/u.test(normalized)) {
    const range = getWeekRange(today, 0);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      raw: "esta semana"
    };
  }

  if (/\b(?:proxima|da proxima)\s+semana\b|\b(?:para|pra)\s+a\s+semana\b|\bsemana\s+que\s+vem\b/u.test(normalized)) {
    const range = getWeekRange(today, 1);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      raw: "proxima semana"
    };
  }

  if (/\bsemana\s+passada\b/u.test(normalized)) {
    const range = getWeekRange(today, -1);
    return {
      dateFrom: formatIsoDate(range.start),
      dateTo: formatIsoDate(range.end),
      raw: "semana passada"
    };
  }

  return null;
}

function splitDeleteClauses(text: string): string[] {
  return text
    .split(
      /\s+e\s+(?=(?:na|no|segunda|terca|terÃ§a|quarta|quinta|sexta|sabado|sÃ¡bado|domingo|apaga|deixa|so|sÃ³|apenas|o|a|os|as|\d+\b))/iu
    )
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function dedupeDeleteSearchQueries(queries: DeleteSearchQuery[]): DeleteSearchQuery[] {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const key = JSON.stringify(query);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeCalendarEvents(events: CalendarEventSummary[]): CalendarEventSummary[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.pageId)) {
      return false;
    }
    seen.add(event.pageId);
    return true;
  });
}

function selectDeleteEventsFromText(
  text: string,
  matchedEvents: CalendarEventSummary[]
): { usedSelection: boolean; events: CalendarEventSummary[] } {
  const clauses = splitDeleteClauses(text);
  const selectedEvents: CalendarEventSummary[] = [];
  let usedSelection = false;

  for (const clause of clauses) {
    const result = selectDeleteEventsFromClause(clause, matchedEvents);
    if (result.usedSelection) {
      usedSelection = true;
      selectedEvents.push(...result.events);
    }
  }

  if (!usedSelection) {
    const fallback = selectDeleteEventsFromClause(text, matchedEvents);
    if (fallback.usedSelection) {
      return {
        usedSelection: true,
        events: dedupeCalendarEvents(fallback.events)
      };
    }
  }

  return {
    usedSelection,
    events: dedupeCalendarEvents(selectedEvents)
  };
}

function selectDeleteEventsFromClause(
  text: string,
  matchedEvents: CalendarEventSummary[]
): { usedSelection: boolean; events: CalendarEventSummary[] } {
  let selected = matchedEvents;
  let usedSelection = false;

  const multipleStartTimes = extractDeleteSelectionStartTimes(text);
  const timeData = extractTimeData(text);
  const directSelection = parseDeleteSelection(text, matchedEvents.length);
  const directSelectionApplied =
    (directSelection.selectAll || directSelection.indexes.length > 0) &&
    shouldApplyDirectDeleteSelection(text, directSelection, timeData);
  if (directSelectionApplied) {
    selected = directSelection.selectAll
      ? matchedEvents
      : matchedEvents.filter((_, index) => directSelection.indexes.includes(index + 1));
    return {
      usedSelection: true,
      events: selected
    };
  }

  const weekdayFilters = extractWeekdayFilters(text);
  if (weekdayFilters.length > 0) {
    selected = selected.filter((event) => eventMatchesAnyWeekday(event, weekdayFilters));
    usedSelection = true;
  }

  const exactDate = resolveDeleteExplicitDateForSelection(text);
  if (exactDate) {
    selected = selected.filter((event) => calendarEventMatchesExactDate(event, exactDate));
    usedSelection = true;
  }

  const range = resolveDeleteDateRangeFromMessage(text, getTimeContext().currentDate);
  if (range) {
    selected = selected.filter((event) =>
      calendarEventOverlapsRange(event, range.dateFrom, range.dateTo)
    );
    usedSelection = true;
  }

  const startTime =
    multipleStartTimes.length > 1 ? null : normalizeClockTimeValue(timeData.startTime);
  const endTime = normalizeClockTimeValue(timeData.endTime);
  if (startTime) {
    selected = selected.filter((event) => event.startTime === startTime);
    usedSelection = true;
  }
  if (endTime) {
    selected = selected.filter((event) => event.endTime === endTime);
    usedSelection = true;
  }

  const titleFiltered = filterDeleteEventsByTextHint(text, selected);
  if (titleFiltered.usedSelection) {
    selected = titleFiltered.events;
    usedSelection = true;
  }

  if (multipleStartTimes.length > 1) {
    selected = selected.filter(
      (event) => typeof event.startTime === "string" && multipleStartTimes.includes(event.startTime)
    );
    usedSelection = true;
  }

  return {
    usedSelection,
    events: selected
  };
}

function extractDeleteSelectionStartTimes(text: string): string[] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bao\s+(\d)/gu, "as $1");

  if (
    !/\b(?:das?|as)\s+\d{1,2}(?::\d{2})?\b(?:\s*(?:,|e)\s*(?:das?|as)\s+\d{1,2}(?::\d{2})?\b)+/u.test(
      normalized
    )
  ) {
    return [];
  }

  const seen = new Set<string>();
  const matches = normalized.matchAll(/\b(?:das?|as)\s+(\d{1,2})(?::(\d{2}))?\b/gu);
  for (const match of matches) {
    const hour = Number(match[1]);
    const minute = match[2] ?? "00";
    if (hour >= 0 && hour <= 23) {
      seen.add(`${String(hour).padStart(2, "0")}:${minute}`);
    }
  }

  return [...seen];
}

function shouldApplyDirectDeleteSelection(
  text: string,
  selection: { indexes: number[]; selectAll: boolean },
  timeData: ReturnType<typeof extractTimeData>
): boolean {
  if (!selection.selectAll && selection.indexes.length === 0) {
    return false;
  }

  if (selection.selectAll) {
    return true;
  }

  if (looksLikeExplicitWeekdayFilter(text)) {
    return false;
  }

  const hasTimeFilter =
    Boolean(normalizeClockTimeValue(timeData.startTime)) ||
    Boolean(normalizeClockTimeValue(timeData.endTime));
  if (hasTimeFilter) {
    return false;
  }

  if (resolveDeleteExplicitDateForSelection(text)) {
    return false;
  }

  if (resolveDeleteDateRangeFromMessage(text, getTimeContext().currentDate)) {
    return false;
  }

  const explicitTitle = inferExplicitEventTypeTitle(text);
  const unknownTitle = inferUnknownEventTitle(text);
  if (explicitTitle || unknownTitle) {
    return false;
  }

  return true;
}

function looksLikeExplicitWeekdayFilter(text: string): boolean {
  const normalized = normalizeLooseText(text);

  if (
    /\b(?:de|da|do|na|no|para|pela|pel[oa]s?|desta|deste|esta|este|proxima|proximo|proxima|pr[oÃ³]xima)\s+(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/u.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /^(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b/u.test(normalized) &&
    normalized.split(/\s+/u).length > 1
  ) {
    return true;
  }

  return false;
}

function resolveDeleteExplicitDateForSelection(text: string): string | null {
  const normalized = normalizeLooseText(text);
  if (
    /\b(?:segunda|terca|terÃ§a|quarta|quinta|sexta|sabado|sÃ¡bado|domingo)\b/u.test(
      normalized
    )
  ) {
    return null;
  }

  const resolved = resolveDeterministicDateFromMessage(text, getTimeContext().currentDate);
  return resolved ? normalizeDateValue(resolved.date) : null;
}

function extractWeekdayFilters(text: string): string[] {
  const normalized = normalizeLooseText(text);
  const weekdayPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: "segunda", pattern: /\bsegunda(?:-feira)?\b/u },
    { label: "terca", pattern: /\bterca(?:-feira)?\b|\bterÃ§a(?:-feira)?\b/u },
    { label: "quarta", pattern: /\bquarta(?:-feira)?\b/u },
    { label: "quinta", pattern: /\bquinta(?:-feira)?\b/u },
    { label: "sexta", pattern: /\bsexta(?:-feira)?\b/u },
    { label: "sabado", pattern: /\bsabado\b|\bsÃ¡bado\b/u },
    { label: "domingo", pattern: /\bdomingo\b/u }
  ];

  return weekdayPatterns
    .filter((entry) => entry.pattern.test(normalized))
    .map((entry) => entry.label);
}

function eventMatchesAnyWeekday(
  event: CalendarEventSummary,
  weekdays: string[]
): boolean {
  const weekdayMap: Record<string, number> = {
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    domingo: 0
  };

  const eventDate = parseIsoDate(event.date);
  const eventWeekday = eventDate.getUTCDay();
  return weekdays.some((weekday) => weekdayMap[weekday] === eventWeekday);
}

function filterDeleteEventsByTextHint(
  text: string,
  events: CalendarEventSummary[]
): { usedSelection: boolean; events: CalendarEventSummary[] } {
  const normalizedText = normalizeLooseText(text);
  const explicitTitle = inferExplicitEventTypeTitle(text);
  const unknownTitle = inferUnknownEventTitle(text);

  const filtered = events.filter((event) => {
    const normalizedTitle = normalizeLooseText(event.title);
    const normalizedCategory =
      typeof event.category === "string" ? normalizeLooseText(event.category) : "";

    if (
      explicitTitle &&
      normalizeLooseText(explicitTitle) === normalizedTitle
    ) {
      return true;
    }

    if (
      unknownTitle &&
      normalizeLooseText(unknownTitle) === normalizedTitle
    ) {
      return true;
    }

    if (normalizedTitle && normalizedText.includes(normalizedTitle)) {
      return true;
    }

    if (normalizedCategory && normalizedText.includes(normalizedCategory)) {
      return true;
    }

    return false;
  });

  const usedSelection =
    Boolean(explicitTitle) ||
    Boolean(unknownTitle) ||
    filtered.some(
      (event) =>
        normalizeLooseText(text).includes(normalizeLooseText(event.title)) ||
        (event.category &&
          normalizeLooseText(text).includes(normalizeLooseText(event.category)))
    );

  return {
    usedSelection,
    events: usedSelection ? filtered : events
  };
}

function messageSuggestsDeleteSubsetRefinement(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:so|sÃ³|apenas|deixa|deixar|queria|afinal|destes|desses|destas|dessas)\b/u.test(
    normalized
  );
}

function filterCalendarSearchResults(
  events: CalendarEventSummary[],
  filters: CalendarSearchFilters & { userId?: string }
): CalendarEventSummary[] {
  return events
    .filter((event) => {
      if (filters.userId && event.userId && event.userId !== filters.userId) {
        return false;
      }

      if (
        !calendarEventMatchesFilters(event, {
          date: filters.date,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo
        })
      ) {
        return false;
      }

      if (filters.startTime && event.startTime !== filters.startTime) {
        return false;
      }

      if (filters.endTime && event.endTime !== filters.endTime) {
        return false;
      }

      if (filters.title) {
        const wanted = normalizeLooseText(filters.title);
        const haystacks = [
          event.title,
          event.description ?? "",
          event.category ?? ""
        ]
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
    })
    .slice(0, filters.limit ?? events.length);
}

function calendarEventMatchesExactDate(
  event: CalendarEventSummary,
  date: string
): boolean {
  const eventEnd = event.endDate ?? event.date;
  return event.date <= date && eventEnd >= date;
}

function calendarEventOverlapsRange(
  event: CalendarEventSummary,
  dateFrom: string,
  dateTo: string
): boolean {
  const eventEnd = event.endDate ?? event.date;
  return event.date <= dateTo && eventEnd >= dateFrom;
}

function calendarEventMatchesFilters(
  event: CalendarEventSummary,
  filters: Pick<CalendarSearchFilters, "date" | "dateFrom" | "dateTo">
): boolean {
  if (filters.date && !calendarEventMatchesExactDate(event, filters.date)) {
    return false;
  }

  if (
    filters.dateFrom &&
    filters.dateTo &&
    !calendarEventOverlapsRange(event, filters.dateFrom, filters.dateTo)
  ) {
    return false;
  }

  const eventEnd = event.endDate ?? event.date;
  if (filters.dateFrom && !filters.dateTo && eventEnd < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && !filters.dateFrom && event.date > filters.dateTo) {
    return false;
  }

  return true;
}

function parseDeleteSelection(
  text: string,
  maxIndex: number
): { indexes: number[]; selectAll: boolean } {
  const normalized = normalizeLooseText(text);
  if (
    /\b(?:ambos|ambas|todos|todas|tudo|os dois|as duas)\b/u.test(normalized)
  ) {
    return {
      indexes: [],
      selectAll: true
    };
  }

  const indexes = new Set<number>();
  const numberMatches = normalized.match(/\b\d+\b/gu) ?? [];
  for (const match of numberMatches) {
    const value = Number(match);
    if (value >= 1 && value <= maxIndex) {
      indexes.add(value);
    }
  }

  const ordinalMap: Record<string, number> = {
    primeiro: 1,
    primeira: 1,
    segundo: 2,
    segunda: 2,
    terceiro: 3,
    terceira: 3,
    quarto: 4,
    quarta: 4,
    quinto: 5,
    quinta: 5
  };

  for (const [word, index] of Object.entries(ordinalMap)) {
    if (new RegExp(`\\b${word}\\b`, "u").test(normalized) && index <= maxIndex) {
      indexes.add(index);
    }
  }

  return {
    indexes: [...indexes].sort((a, b) => a - b),
    selectAll: false
  };
}

function getPendingCalendarEvents(value: unknown): CalendarEventSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is CalendarEventSummary =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as CalendarEventSummary).pageId === "string" &&
      typeof (item as CalendarEventSummary).title === "string" &&
      typeof (item as CalendarEventSummary).date === "string"
  );
}

function sanitizeDeleteExtractedData(
  extractedData: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...extractedData };
  const allowedKeys = new Set([
    "title",
    "date",
    "dateFrom",
    "dateTo",
    "rawDate",
    "startTime",
    "endTime",
    "matchedEvents",
    "selectedEvents",
    "selectedPageIds",
    "deleteAllRequested"
  ]);

  return Object.fromEntries(
    Object.entries(next).filter(([key]) => allowedKeys.has(key))
  );
}

function resolveDeleteTitleCandidate(
  interpretation: LlmInterpretation,
  messageText: string
): string | null {
  const extractedTitle =
    typeof interpretation.extractedData.title === "string"
      ? normalizeSentenceCase(interpretation.extractedData.title)
      : null;

  if (
    extractedTitle &&
    titleHasSupportInMessage(extractedTitle, messageText) &&
    !isSuspiciousFreshEventTitle(extractedTitle, messageText)
  ) {
    return extractedTitle;
  }

  return null;
}

function isDeleteAllRequest(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /\b(?:tudo|todos|todas|ambos|ambas)\b/u.test(normalized);
}

function isNegativePhrase(text: string): boolean {
  const normalized = normalizeLooseText(text);
  return /^(?:nao|nÃ£o|nop|nope|cancelar|cancela|afinal nao|afinal nÃ£o|nenhum)$/u.test(
    normalized
  );
}

function applyPendingFieldAnswerHeuristics(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null
): LlmInterpretation {
  if (!pending || pending.command !== "create_event") {
    return interpretation;
  }

  const trimmedContent = message.content.trim();
  const extractedData = { ...interpretation.extractedData };
  const missingSet = new Set(interpretation.missingFields);
  const timeData = extractTimeData(trimmedContent);
  const shortTimeReply = isLikelyStandaloneTimeReply(trimmedContent)
    ? parseShortTimeReply(trimmedContent)
    : null;

  let changed = false;
  let nextCommand = interpretation.command;
  let nextHasCommand = interpretation.hasCommand;

  if (pending.missingFields.includes("titleConfirmation")) {
    nextCommand = "create_event";
    nextHasCommand = true;
    changed = true;

    if (!isAffirmativePhrase(trimmedContent) && !isSkipPhrase(trimmedContent)) {
      const newTitle = trimmedContent
        .replace(
          /^(?:muda\s+para|prefiro|chama.se|que\s+se\s+chame|nome|titulo|e\s+melhor|sim\s+mas|quero\s+antes)\s+/iu,
          ""
        )
        .trim();
      if (newTitle) {
        extractedData.title = normalizeSentenceCase(newTitle);
      }
    }

    delete extractedData.__titleInferred;
    missingSet.delete("titleConfirmation");
  }

  if (
    (pending.missingFields.includes("startTime") ||
      pending.missingFields.includes("time")) &&
    !hasNonEmptyValue(extractedData.startTime)
  ) {
    const inferredStartTime =
      timeData.startTime ??
      (!timeData.endTime && shortTimeReply ? shortTimeReply : null);

    if (inferredStartTime) {
      nextCommand = "create_event";
      nextHasCommand = true;
      changed = true;
      extractedData.startTime = inferredStartTime;
      extractedData.time = inferredStartTime;
      extractedData.rawTime = trimmedContent;
      missingSet.delete("startTime");
      missingSet.delete("time");
    }
  }

  if (pending.missingFields.includes("endTime") && !hasNonEmptyValue(extractedData.endTime)) {
    const standaloneDurationMinutes = extractStandaloneDurationMinutes(trimmedContent);
    const currentStartTime =
      (standaloneDurationMinutes !== null
        ? normalizeClockTimeValue(pending.extractedData?.startTime) ??
          normalizeClockTimeValue(pending.extractedData?.time)
        : normalizeClockTimeValue(extractedData.startTime) ??
          normalizeClockTimeValue(extractedData.time) ??
          normalizeClockTimeValue(pending.extractedData?.startTime) ??
          normalizeClockTimeValue(pending.extractedData?.time));
    const explicitDurationMinutes =
      extractExplicitDurationMinutes(trimmedContent) ?? standaloneDurationMinutes;
    const durationBasedEndTime =
      currentStartTime && explicitDurationMinutes !== null
        ? addMinutesToClockTime(currentStartTime, explicitDurationMinutes)
        : null;
    const inferredEndTime = timeData.endTime ?? shortTimeReply ?? durationBasedEndTime;

    if (inferredEndTime) {
      nextCommand = "create_event";
      nextHasCommand = true;
      changed = true;
      extractedData.endTime = inferredEndTime;
      extractedData.rawTime = trimmedContent;
      missingSet.delete("endTime");
      missingSet.delete("time");
    }
  }

  if (
    pending.missingFields.includes("description") &&
    !hasNonEmptyValue(extractedData.description)
  ) {
    const explicitDurationMinutes =
      extractExplicitDurationMinutes(trimmedContent) ??
      extractStandaloneDurationMinutes(trimmedContent);
    if (isDescriptionSkipReply(trimmedContent)) {
      nextCommand = "create_event";
      nextHasCommand = true;
      changed = true;
      extractedData.__descriptionSkipped = true;
      delete extractedData.description;
      missingSet.delete("description");
    } else if (
      trimmedContent.length > 0 &&
      !looksLikeTemporalOnly(trimmedContent) &&
      explicitDurationMinutes === null &&
      !timeData.startTime &&
      !timeData.endTime
    ) {
      nextCommand = "create_event";
      nextHasCommand = true;
      changed = true;
      const descContent = trimmedContent.replace(
        /^(?:sim|ok|okay|claro|certo|ah\s+sim|ah\s+ok|pode|pode\s+ser)\s+/iu,
        ""
      ).trim();
      extractedData.description = normalizeSentenceCase(
        stripDescriptionPreamble(descContent || trimmedContent)
      );
      delete extractedData.__descriptionSkipped;
      missingSet.delete("description");
    }
  }

  if (!changed) {
    return interpretation;
  }

  return {
    ...interpretation,
    command: nextCommand,
    hasCommand: nextHasCommand,
    extractedData,
    missingFields: [...missingSet]
  };
}

function stripUnsupportedFreshTitle(
  messageContent: string,
  interpretation: LlmInterpretation,
  pending: PendingCommand | null
): LlmInterpretation {
  if (pending || interpretation.command !== "create_event") {
    return interpretation;
  }

  const title = typeof interpretation.extractedData.title === "string"
    ? interpretation.extractedData.title
    : null;

  if (
    !title ||
    isTrustedNormalizedEventTitle(interpretation.extractedData) ||
    (titleHasSupportInMessage(title, messageContent) &&
      !isSuspiciousFreshEventTitle(title, messageContent))
  ) {
    return interpretation;
  }

  const extractedData = { ...interpretation.extractedData } as Record<string, unknown>;
  delete extractedData.title;
  delete extractedData.__titleInferred;

  const fieldEvidence = interpretation.fieldEvidence
    ? { ...interpretation.fieldEvidence }
    : undefined;
  if (fieldEvidence) {
    delete fieldEvidence.title;
  }

  return {
    ...interpretation,
    extractedData,
    fieldEvidence,
    missingFields: Array.from(new Set([...interpretation.missingFields, "title"]))
  };
}

function enrichCreateEventInterpretation(
  interpretation: LlmInterpretation
): LlmInterpretation {
  const extracted = sanitizeExtractedDataKeys(interpretation.extractedData);
  const missing = new Set(interpretation.missingFields);

  // category e opcional â€” nunca bloqueia a conclusao do evento
  missing.delete("category");

  if (!hasNonEmptyValue(extracted.rawTime)) {
    if (hasNonEmptyValue(extracted.startTime) && hasNonEmptyValue(extracted.endTime)) {
      extracted.rawTime = `${extracted.startTime} ate ${extracted.endTime}`;
    } else if (hasNonEmptyValue(extracted.startTime)) {
      extracted.rawTime = String(extracted.startTime);
    } else if (hasNonEmptyValue(extracted.time)) {
      extracted.rawTime = String(extracted.time);
    } else if (hasNonEmptyValue(extracted.endTime)) {
      extracted.rawTime = String(extracted.endTime);
    } else {
      delete extracted.time;
      delete extracted.startTime;
      delete extracted.endTime;
    }
  }

  if (isDefaultAssumedTime(extracted.time, extracted.startTime, extracted.endTime)) {
    delete extracted.time;
    delete extracted.startTime;
    delete extracted.endTime;
    delete extracted.rawTime;
  }

  // rawDate so deve conter expressoes de data curtas (ex: "amanha", "na quarta", "segunda").
  // Descarta se parece hora (HH:MM) ou se o modelo inventou texto longo (> 3 palavras).
  if (typeof extracted.rawDate === "string") {
    const isTimeLike = /\d{1,2}[:h]\d{0,2}/u.test(extracted.rawDate);
    const isTooLong = extracted.rawDate.trim().split(/\s+/).length > 3;
    const hasTemporalWord = messageHasTemporalExpression(extracted.rawDate);
    if (isTimeLike || isTooLong || !hasTemporalWord) {
      delete extracted.rawDate;
    }
  }

  if (isWeakDescription(extracted.description)) {
    delete extracted.description;
  }

  // Apagar descricao que e igual (ou prefixo) ao titulo â€” o LLM tende a copiar o titulo
  if (
    typeof extracted.description === "string" &&
    typeof extracted.title === "string" &&
    (
      extracted.description.trim().toLowerCase() === extracted.title.trim().toLowerCase() ||
      isDescriptionEquivalentToTitle(extracted.description, extracted.title)
    )
  ) {
    delete extracted.description;
  }

  if (typeof extracted.title === "string") {
    extracted.title = normalizeSentenceCase(extracted.title);
  }
  if (typeof extracted.date === "string") {
    const normalizedDate = normalizeDateValue(extracted.date);
    if (normalizedDate) {
      extracted.date = normalizedDate;
    } else {
      delete extracted.date;
    }
  }
  if (typeof extracted.endDate === "string") {
    const normalizedEndDate = normalizeDateValue(extracted.endDate);
    if (normalizedEndDate) {
      extracted.endDate = normalizedEndDate;
    } else {
      delete extracted.endDate;
    }
  }
  if (typeof extracted.time === "string") {
    const normalizedTime = normalizeClockTimeValue(extracted.time);
    if (normalizedTime) {
      extracted.time = normalizedTime;
    } else {
      delete extracted.time;
    }
  }
  if (typeof extracted.startTime === "string") {
    const normalizedStartTime = normalizeClockTimeValue(extracted.startTime);
    if (normalizedStartTime) {
      extracted.startTime = normalizedStartTime;
    } else {
      delete extracted.startTime;
    }
  }
  if (typeof extracted.endTime === "string") {
    const normalizedEndTime = normalizeClockTimeValue(extracted.endTime);
    if (normalizedEndTime) {
      extracted.endTime = normalizedEndTime;
    } else {
      delete extracted.endTime;
    }
  }
  if (typeof extracted.description === "string") {
    extracted.description = normalizeSentenceCase(extracted.description);
  }
  if (typeof extracted.allDay !== "boolean") {
    delete extracted.allDay;
  }

  const hasDate = hasNonEmptyValue(extracted.date);
  const hasEndDate = hasNonEmptyValue(extracted.endDate);
  if (
    hasDate &&
    hasEndDate &&
    typeof extracted.date === "string" &&
    typeof extracted.endDate === "string" &&
    extracted.endDate < extracted.date
  ) {
    delete extracted.endDate;
    delete extracted.allDay;
  }

  const hasTime =
    hasNonEmptyValue(extracted.startTime) && hasNonEmptyValue(extracted.endTime);
  const hasAllDayDate =
    hasDate &&
    extracted.allDay === true &&
    !hasNonEmptyValue(extracted.endDate) &&
    !hasNonEmptyValue(extracted.startTime) &&
    !hasNonEmptyValue(extracted.endTime);
  const hasAllDayRange =
    hasDate &&
    hasNonEmptyValue(extracted.endDate) &&
    extracted.allDay === true &&
    !hasNonEmptyValue(extracted.startTime) &&
    !hasNonEmptyValue(extracted.endTime);
  const hasSchedule = hasTime || hasAllDayRange || hasAllDayDate;
  const hasTitle = hasNonEmptyValue(extracted.title);
  const hasCategory = hasNonEmptyValue(extracted.category);
  const descriptionSkipped = Boolean(extracted.__descriptionSkipped);
  const titleNeedsConfirmation = Boolean(extracted.__titleInferred);

  // A descricao e sempre o ultimo campo a recolher â€” so via pergunta explicita.
  // Limpar qualquer descricao pre-preenchida pelo LLM enquanto ainda faltam campos principais.
  if (!hasTitle || !hasDate || !hasSchedule) {
    delete extracted.description;
  }

  const hasDescription = hasNonEmptyValue(extracted.description);

  if (hasTime) {
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  }
  if (hasAllDayRange) {
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  }
  if (hasAllDayDate) {
    missing.delete("time");
    missing.delete("startTime");
    missing.delete("endTime");
  }

  // Limpar campos que ja estao preenchidos, independentemente do que o LLM disse
  if (hasNonEmptyValue(extracted.startTime)) {
    missing.delete("startTime");
    missing.delete("time");
  }
  if (hasNonEmptyValue(extracted.endTime)) {
    missing.delete("endTime");
  }

  // Enforcar campos obrigatorios â€” o LLM pode devolver missingFields:[] com campos nulos
  if (!hasTitle) {
    missing.add("title");
  } else {
    missing.delete("title");
  }
  if (!hasDate) {
    missing.add("date");
  } else {
    missing.delete("date");
    missing.delete("rawDate");
  }
  if (hasAllDayRange || hasAllDayDate) {
    missing.delete("startTime");
    missing.delete("endTime");
    missing.delete("time");
  } else {
    if (!hasNonEmptyValue(extracted.startTime)) {
      missing.add("startTime");
    } else {
      missing.delete("startTime");
      missing.delete("time"); // limpar legacy
    }
    missing.delete("time"); // nunca expor "time" no missingFields â€” e um campo interno
    if (!hasNonEmptyValue(extracted.endTime)) {
      missing.add("endTime");
    } else {
      missing.delete("endTime");
    }
  }
  if (hasDescription) {
    missing.delete("description");
  }

  if (hasTitle && hasDate && hasSchedule && !hasCategory) {
    const derivedCategory = deriveEventCategory(extracted);
    if (derivedCategory) {
      extracted.category = derivedCategory;
    }
  }

  if (titleNeedsConfirmation && isTrustedNormalizedEventTitle(extracted)) {
    delete extracted.__titleInferred;
  }

  if (hasTitle && hasDate && hasSchedule && titleNeedsConfirmation) {
    const suggestedName = typeof extracted.title === "string" ? extracted.title : "";
    const question = `Pensei em chamar isto "${suggestedName}". Faz sentido ou preferes outro nome?`;
    return {
      ...interpretation,
      extractedData: extracted,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["titleConfirmation"],
      followUpQuestion: question,
      reply: question
    };
  }

  if (hasTitle && hasDate && hasSchedule && !hasDescription && !descriptionSkipped) {
    const titleStr = typeof extracted.title === "string" ? extracted.title : "";
    const titleLower = titleStr ? titleStr.charAt(0).toLowerCase() + titleStr.slice(1) : "";
    const article = getTitleArticle(titleLower);
    const descQuestion = titleStr
      ? `Tens alguma nota sobre ${article} ${titleLower}? (podes 'saltar' se quiseres)`
      : `Tens alguma nota a acrescentar? (podes 'saltar' se quiseres)`;
    return {
      ...interpretation,
      extractedData: extracted,
      isComplete: false,
      needsCalendarAction: false,
      shouldAskFollowUp: true,
      missingFields: ["description"],
      followUpQuestion: descQuestion,
      reply: descQuestion
    };
  }

  if (hasTitle && hasDate && hasSchedule && (hasDescription || descriptionSkipped)) {
    delete extracted.__descriptionSkipped;
    return {
      ...interpretation,
      extractedData: extracted,
      isComplete: true,
      needsCalendarAction: true,
      shouldAskFollowUp: false,
      missingFields: [],
      followUpQuestion: "",
      reply: buildCreateEventConfirmation(extracted)
    };
  }

  const visibleMissingFields = [...missing].filter((field) => !field.startsWith("__"));

  return {
    ...interpretation,
    extractedData: extracted,
    missingFields: visibleMissingFields,
    isComplete:
      interpretation.hasCommand ? visibleMissingFields.length === 0 : interpretation.isComplete,
    shouldAskFollowUp:
      visibleMissingFields.length > 0 ? true : interpretation.shouldAskFollowUp,
    needsCalendarAction:
      interpretation.hasCommand && visibleMissingFields.length === 0 ? true : false
  };
}

function sanitizeExtractedDataKeys(
  extractedData: Record<string, unknown>
): Record<string, unknown> {
  const allowedKeys = new Set([
    "title",
    "date",
    "endDate",
    "rawDate",
    "time",
    "rawTime",
    "startTime",
    "endTime",
    "description",
    "category",
    "allDay",
    "targetText",
    "batchItems",
    "createItems",
    "recurrence",
    "__descriptionSkipped",
    "__titleInferred"
  ]);

  return Object.fromEntries(
    Object.entries(extractedData).filter(([key]) => allowedKeys.has(key))
  );
}

function mergeExtractedData(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  latestMessage: string,
  previousMissingFields?: string[]
): Record<string, unknown> {
  const merged = { ...previous };
  const affirmativeTitleConfirmation =
    previousMissingFields?.includes("titleConfirmation") &&
    isAffirmativePhrase(latestMessage);
  const titleWasRequestedThisTurn =
    previousMissingFields?.includes("title") ||
    previousMissingFields?.includes("titleConfirmation") ||
    false;
  const previousHadTitle = hasNonEmptyValue(previous.title);
  const explicitDescriptionSkip =
    previousMissingFields?.includes("description") && isDescriptionSkipReply(latestMessage);
  const expectingStartTime =
    previousMissingFields?.includes("startTime") ||
    previousMissingFields?.includes("time") ||
    false;
  const expectingEndTime = previousMissingFields?.includes("endTime") || false;
  const standaloneTimeReply = isLikelyStandaloneTimeReply(latestMessage);
  const standaloneDurationReply =
    expectingEndTime ? extractStandaloneDurationMinutes(latestMessage) : null;

  for (const [key, value] of Object.entries(current)) {
    if (key === "__titleInferred" && affirmativeTitleConfirmation) {
      continue;
    }
    if (key === "__descriptionSkipped" && !explicitDescriptionSkip) {
      continue;
    }
    if (key === "description" && isWeakDescription(value)) {
      continue;
    }
    // Nao sobrepor valores anteriores com null/undefined do LLM
    if ((value === null || value === undefined) && hasNonEmptyValue(previous[key])) {
      continue;
    }
    // A data nao deve ser sobrescrita pelo LLM quando a mensagem nao contem expressoes temporais
    // (ex: utilizador responde ao titulo e o LLM inventa uma data diferente)
    if (key === "date" && hasNonEmptyValue(previous[key]) && !messageHasDateAnchor(latestMessage)) {
      continue;
    }
    // Campos ja preenchidos que NAO estavam em missingFields nao podem ser alterados pelo LLM.
    // Evita que o LLM sobrescreva title/date/time com o conteudo de uma resposta de outro campo.
    if (
      hasNonEmptyValue(previous[key]) &&
      previousMissingFields !== undefined &&
      !previousMissingFields.includes(key)
    ) {
      continue;
    }
    merged[key] = value;
  }

  if (affirmativeTitleConfirmation) {
    delete merged.__titleInferred;
  }

  if (explicitDescriptionSkip) {
    merged.__descriptionSkipped = true;
    delete merged.description;
  } else {
    delete merged.__descriptionSkipped;
  }

  const timeData = extractTimeData(latestMessage);
  const explicitDurationMinutes = extractExplicitDurationMinutes(latestMessage);
  const normalizedCurrentStartTime = normalizeClockTimeValue(current.startTime);
  const normalizedCurrentEndTime = normalizeClockTimeValue(current.endTime);
  const currentHasStartTime = Boolean(normalizedCurrentStartTime);
  const currentHasEndTime = Boolean(normalizedCurrentEndTime);
  const currentHasRawTime = hasNonEmptyValue(current.rawTime);
  const allowStandaloneStartTime =
    standaloneTimeReply && expectingStartTime && currentHasStartTime;
  const allowStandaloneEndTime =
    standaloneTimeReply && expectingEndTime && currentHasEndTime;
  const currentStartTimeContext =
    normalizeClockTimeValue(merged.startTime) ??
    normalizeClockTimeValue(merged.time) ??
    normalizeClockTimeValue(previous.startTime) ??
    normalizeClockTimeValue(previous.time);
  const keepCurrentDerivedEndTime =
    explicitDurationMinutes !== null &&
    currentHasEndTime &&
    Boolean(currentStartTimeContext);
  if (timeData.startTime && standaloneDurationReply === null) {
    merged.startTime = timeData.startTime;
    merged.time = timeData.startTime;
  } else if (allowStandaloneStartTime && normalizedCurrentStartTime) {
    merged.startTime = normalizedCurrentStartTime;
    merged.time = normalizedCurrentStartTime;
    merged.rawTime = latestMessage.trim();
  } else if (!hasNonEmptyValue(previous.startTime) && !hasNonEmptyValue(previous.rawTime)) {
    // Nenhuma hora anterior nem na mensagem â†’ rejeitar hora inventada pelo LLM
    delete merged.startTime;
    delete merged.time;
    delete merged.rawTime;
  } else {
    // Mensagem sem hora mas existe hora anterior â†’ restaurar do turno anterior, ignorar hallucinacao do LLM
    if (!currentHasStartTime) {
      merged.startTime = previous.startTime;
      merged.time = (previous.time as string | undefined) ?? (previous.startTime as string | undefined);
    }
    if (!timeData.endTime && !currentHasEndTime) {
      merged.endTime = previous.endTime;
    }
    if (!currentHasRawTime) {
      merged.rawTime = previous.rawTime;
    }
  }
  if (timeData.endTime) {
    merged.endTime = timeData.endTime;
  } else if (allowStandaloneEndTime && normalizedCurrentEndTime) {
    merged.endTime = normalizedCurrentEndTime;
    merged.rawTime = latestMessage.trim();
  } else if (keepCurrentDerivedEndTime && normalizedCurrentEndTime) {
    merged.endTime = normalizedCurrentEndTime;
  } else if (
    standaloneDurationReply !== null &&
    typeof merged.startTime === "string"
  ) {
    const derivedEndTime = addMinutesToClockTime(merged.startTime, standaloneDurationReply);
    if (derivedEndTime) {
      merged.endTime = derivedEndTime;
    }
  } else if (!hasNonEmptyValue(previous.endTime)) {
    delete merged.endTime;
  }
  if (timeData.rawTime) {
    merged.rawTime = timeData.rawTime;
  }

  if (!hasNonEmptyValue(merged.title)) {
    const inferredTitle = inferTitleFromContext(latestMessage, merged);
    if (inferredTitle) {
      merged.title = inferredTitle;
    }
  } else if (typeof merged.title === "string") {
    const wasGeneric = isGenericEventTitle(merged.title);
    const improvedTitle = improveGenericTitle(merged.title, latestMessage);
    if (improvedTitle) {
      merged.title = improvedTitle;
      if (
        wasGeneric &&
        !isTrustedNormalizedEventTitle(merged) &&
        !titleHasSupportInMessage(improvedTitle, latestMessage)
      ) {
        merged.__titleInferred = true;
      } else {
        delete merged.__titleInferred;
      }
    } else if (wasGeneric) {
      const unknownTitle = inferUnknownEventTitle(latestMessage);
      if (unknownTitle) {
        merged.title = unknownTitle;
      }
      const supportedGenericTitle =
        typeof merged.title === "string" && titleHasSupportInMessage(merged.title, latestMessage);
      const shouldConfirmGenericTitle =
        !isTrustedNormalizedEventTitle(merged) &&
        !supportedGenericTitle &&
        !affirmativeTitleConfirmation &&
        (!previousHadTitle || titleWasRequestedThisTurn);

      if (shouldConfirmGenericTitle) {
        merged.__titleInferred = true;
      } else {
        delete merged.__titleInferred;
      }
    }
  }

  const explicitEventTypeTitle = inferExplicitEventTypeTitle(latestMessage);
  if (explicitEventTypeTitle) {
    merged.title = explicitEventTypeTitle;
    delete merged.__titleInferred;
  }

  if (
    typeof merged.title === "string" &&
    titleHasSupportInMessage(merged.title, latestMessage) &&
    (titleWasRequestedThisTurn || !previousHadTitle)
  ) {
    delete merged.__titleInferred;
  }

  const mayInferDescriptionFromLatestMessage =
    !previousMissingFields || previousMissingFields.includes("description");

  if (mayInferDescriptionFromLatestMessage) {
    const inferredDescription = inferDescriptionFromContext(latestMessage);
    if (inferredDescription && !previousMissingFields) {
      merged.description = inferredDescription;
    } else if (inferredDescription && !hasNonEmptyValue(merged.description)) {
      merged.description = inferredDescription;
    }
  }

  const derivedCategory = deriveEventCategory(merged);
  if (derivedCategory) {
    merged.category = derivedCategory;
  } else if (typeof merged.category === "string" && !normalizeExplicitCategoryValue(merged.category)) {
    delete merged.category;
  }

  if (typeof merged.title === "string") {
    merged.title = normalizeSentenceCase(merged.title);
  }
  if (typeof merged.description === "string") {
    merged.description = normalizeSentenceCase(merged.description);
  }

  return merged;
}

function sanitizeTimeFieldsFromCurrentTurn(
  extractedData: Record<string, unknown>,
  latestMessage: string,
  pending: PendingCommand | null
): Record<string, unknown> {
  const sanitized = { ...extractedData };
  const timeDataFromMessage = extractTimeData(latestMessage);
  const explicitDurationMinutes = extractExplicitDurationMinutes(latestMessage);
  const standaloneTimeReply = isLikelyStandaloneTimeReply(latestMessage);
  const replyingWithStartTime =
    standaloneTimeReply &&
    Boolean(
      pending?.missingFields?.includes("startTime") ||
        pending?.missingFields?.includes("time")
    );
  const replyingWithEndTime =
    standaloneTimeReply && Boolean(pending?.missingFields?.includes("endTime"));
  const previousStartTime = pending?.extractedData?.startTime;
  const previousEndTime = pending?.extractedData?.endTime;
  const currentStartTime =
    normalizeClockTimeValue(sanitized.startTime) ??
    normalizeClockTimeValue(sanitized.time) ??
    normalizeClockTimeValue(previousStartTime);
  const keepDurationDerivedEndTime =
    explicitDurationMinutes !== null &&
    hasNonEmptyValue(sanitized.endTime) &&
    Boolean(currentStartTime);

  if (
    hasNonEmptyValue(sanitized.startTime) &&
    !timeDataFromMessage.startTime &&
    !replyingWithStartTime &&
    !hasNonEmptyValue(previousStartTime)
  ) {
    delete sanitized.startTime;
    if (
      typeof sanitized.time === "string" &&
      normalizeClockTimeValue(sanitized.time) === normalizeClockTimeValue(extractedData.startTime)
    ) {
      delete sanitized.time;
    }
  }

  if (
    hasNonEmptyValue(sanitized.endTime) &&
    !timeDataFromMessage.endTime &&
    !replyingWithEndTime &&
    !keepDurationDerivedEndTime &&
    !hasNonEmptyValue(previousEndTime)
  ) {
    delete sanitized.endTime;
  }

  if (!hasNonEmptyValue(sanitized.startTime) && !hasNonEmptyValue(sanitized.endTime)) {
    delete sanitized.rawTime;
  }

  return sanitized;
}

function extractTimeData(text: string): {
  startTime?: string;
  endTime?: string;
  rawTime?: string;
} {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/\bao\s+(\d)/gu, "as $1")
    .replace(/\bo\s+(\d{1,2}:\d{2})\b/gu, "$1");

  // "comeÃ§a Ã s 11:30 e termina Ã s 12:30" / "comeÃ§a as 12:30 e vai ate as 15:00"
  const verbRangeMatch = normalized.match(
    /\b(?:come[cÃ§]a|inicia?)\s+(?:as?\s+)?(\d{1,2})[:h](\d{2})(?:\s*h)?\b.*?\b(?:termina?|acaba|(?:vai\s+)?ate)\s+(?:as?\s+)?(\d{1,2})[:h](\d{2})(?:\s*h)?\b/u
  );
  if (verbRangeMatch) {
    return {
      startTime: `${verbRangeMatch[1].padStart(2, "0")}:${verbRangeMatch[2]}`,
      endTime: `${verbRangeMatch[3].padStart(2, "0")}:${verbRangeMatch[4]}`,
      rawTime: verbRangeMatch[0]
    };
  }

  // "comeÃ§a as 20 e acaba as 21" / "comeÃ§a Ã s 20 e termina Ã s 21" â€” horas inteiras com verbos
  const verbRangeHourMatch = normalized.match(
    /\b(?:come[cÃ§]a|inicia?)\s+(?:as?\s+)?(\d{1,2})\b(?![:h]\d).{0,30}?\b(?:termina?|acaba|(?:vai\s+)?ate)\s+(?:as?\s+)?(\d{1,2})\b(?![:h]\d)/u
  );
  if (verbRangeHourMatch) {
    const vStart = parseInt(verbRangeHourMatch[1], 10);
    const vEnd = parseInt(verbRangeHourMatch[2], 10);
    if (vStart >= 0 && vStart <= 23 && vEnd >= 0 && vEnd <= 23) {
      return {
        startTime: `${verbRangeHourMatch[1].padStart(2, "0")}:00`,
        endTime: `${verbRangeHourMatch[2].padStart(2, "0")}:00`,
        rawTime: verbRangeHourMatch[0]
      };
    }
  }

  // "das 11:30 Ã s 12:30" / "11:30 a 12:30" / "11:30 ate 12:30"
  const rangeMatch = normalized.match(
    /\b(?:das?|as\s*)?(\d{1,2})[:h](\d{2})\s*(?:h)?\s*(?:ate|a|as)\s*(?:as\s*)?(\d{1,2})[:h](\d{2})\s*(?:h)?\b/u
  );
  if (rangeMatch) {
    return {
      startTime: `${rangeMatch[1].padStart(2, "0")}:${rangeMatch[2]}`,
      endTime: `${rangeMatch[3].padStart(2, "0")}:${rangeMatch[4]}`,
      rawTime: rangeMatch[0]
    };
  }

  // "as 12:30 e vai ate as 15:00" â€” startTime e endTime com texto no meio (ate 40 chars)
  const flexRangeMatch = normalized.match(
    /\b(\d{1,2})[:h](\d{2})(?:\s*h)?\b.{0,40}?\bate\s+(?:as?\s+)?(\d{1,2})[:h](\d{2})(?:\s*h)?\b/u
  );
  if (flexRangeMatch) {
    return {
      startTime: `${flexRangeMatch[1].padStart(2, "0")}:${flexRangeMatch[2]}`,
      endTime: `${flexRangeMatch[3].padStart(2, "0")}:${flexRangeMatch[4]}`,
      rawTime: flexRangeMatch[0]
    };
  }

  // "das 15 ate as 19" / "das 10 as 18" â€” intervalo de horas inteiras sem minutos
  const rangeHourOnlyMatch = normalized.match(
    /\bdas?\s+(\d{1,2})\b(?![:h]\d)\s+(?:ate\s+)?(?:as?\s+)?(\d{1,2})\b(?![:h]\d)/u
  );
  if (rangeHourOnlyMatch) {
    const start = parseInt(rangeHourOnlyMatch[1], 10);
    const end = parseInt(rangeHourOnlyMatch[2], 10);
    if (start >= 0 && start <= 23 && end >= 0 && end <= 23 && start < end) {
      return {
        startTime: `${rangeHourOnlyMatch[1].padStart(2, "0")}:00`,
        endTime: `${rangeHourOnlyMatch[2].padStart(2, "0")}:00`,
        rawTime: rangeHourOnlyMatch[0]
      };
    }
  }

  // "as 15 ate as 18" / "as 10 as 12" - intervalo de horas inteiras sem minutos
  const rangeHourOnlyAsMatch = normalized.match(
    /\bas\s+(\d{1,2})\b(?![:h]\d)\s+(?:ate\s+)?(?:as?\s+)?(\d{1,2})\b(?![:h]\d)/u
  );
  if (rangeHourOnlyAsMatch) {
    const start = parseInt(rangeHourOnlyAsMatch[1], 10);
    const end = parseInt(rangeHourOnlyAsMatch[2], 10);
    if (start >= 0 && start <= 23 && end >= 0 && end <= 23 && start < end) {
      return {
        startTime: `${rangeHourOnlyAsMatch[1].padStart(2, "0")}:00`,
        endTime: `${rangeHourOnlyAsMatch[2].padStart(2, "0")}:00`,
        rawTime: rangeHourOnlyAsMatch[0]
      };
    }
  }

  // "das 20h as 22h" / "as 20h ate as 22h" â€” intervalo de horas inteiras com sufixo h
  const rangeHourWithHMatch = normalized.match(
    /\b(?:das?|as)\s+(\d{1,2})h\b.{0,12}?\b(?:ate|a|as)\s+(?:as?\s+)?(\d{1,2})h\b/u
  );
  if (rangeHourWithHMatch) {
    const start = parseInt(rangeHourWithHMatch[1], 10);
    const end = parseInt(rangeHourWithHMatch[2], 10);
    if (start >= 0 && start <= 23 && end >= 0 && end <= 23 && start < end) {
      return {
        startTime: `${rangeHourWithHMatch[1].padStart(2, "0")}:00`,
        endTime: `${rangeHourWithHMatch[2].padStart(2, "0")}:00`,
        rawTime: rangeHourWithHMatch[0]
      };
    }
  }

  // "as 11 ate as 11:15" â€” start hora inteira, end com minutos
  const mixedRangeMatch = normalized.match(
    /\bas\s+(\d{1,2})\b(?![:h]\d).{0,20}?\bate\s+(?:as?\s+)?(\d{1,2})[:h](\d{2})(?:\s*h)?\b/u
  );
  if (mixedRangeMatch) {
    const startHour = parseInt(mixedRangeMatch[1], 10);
    if (startHour >= 0 && startHour <= 23) {
      return {
        startTime: `${mixedRangeMatch[1].padStart(2, "0")}:00`,
        endTime: `${mixedRangeMatch[2].padStart(2, "0")}:${mixedRangeMatch[3]}`,
        rawTime: mixedRangeMatch[0]
      };
    }
  }

  // "termina Ã s 12:30" sem startTime explÃ­cito
  const endOnlyMatch = normalized.match(
    /\b(?:termina?|acaba)\s+(?:as?\s+)?(\d{1,2})[:h](\d{2})(?:\s*h)?\b/u
  );
  if (endOnlyMatch) {
    return {
      endTime: `${endOnlyMatch[1].padStart(2, "0")}:${endOnlyMatch[2]}`,
      rawTime: endOnlyMatch[0]
    };
  }

  // "termina as 14" / "acaba as 14" sem startTime explicito
  const endOnlyHourMatch = normalized.match(
    /\b(?:termina?|acaba)\s+(?:as?\s+)?(\d{1,2})\b(?![:h]\d)/u
  );
  if (endOnlyHourMatch) {
    const hour = parseInt(endOnlyHourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return {
        endTime: `${endOnlyHourMatch[1].padStart(2, "0")}:00`,
        rawTime: endOnlyHourMatch[0]
      };
    }
  }

  // "ate as 18:00" / "ate 18h00" / "ate as 15" â†’ so endTime (minutos opcionais)
  const ateMatch = normalized.match(
    /\bate\s+(?:as?\s+)?(\d{1,2})(?:[:h](\d{2}))?(?:\s*h)?\b/u
  );
  if (ateMatch) {
    return {
      endTime: `${ateMatch[1].padStart(2, "0")}:${ateMatch[2] ?? "00"}`,
      rawTime: ateMatch[0]
    };
  }

  // hora simples sem minutos: "as 8" / "as 15" â†’ startTime (0-23)
  const singleHourMatch = normalized.match(/\bas\s+(\d{1,2})\b(?![\s:h]\d)/u);
  if (singleHourMatch) {
    const hour = parseInt(singleHourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      const startTime = `${singleHourMatch[1].padStart(2, "0")}:00`;
      const explicitDurationMinutes = extractExplicitDurationMinutes(normalized);
      const derivedEndTime =
        explicitDurationMinutes !== null
          ? addMinutesToClockTime(startTime, explicitDurationMinutes)
          : null;
      return {
        startTime,
        ...(derivedEndTime ? { endTime: derivedEndTime } : {}),
        rawTime: singleHourMatch[0]
      };
    }
  }

  // hora simples com sufixo h: "as 15h" / "as 19h"
  const singleHourWithHMatch = normalized.match(/\bas\s+(\d{1,2})h\b/u);
  if (singleHourWithHMatch) {
    const hour = parseInt(singleHourWithHMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      const startTime = `${singleHourWithHMatch[1].padStart(2, "0")}:00`;
      const explicitDurationMinutes = extractExplicitDurationMinutes(normalized);
      const derivedEndTime =
        explicitDurationMinutes !== null
          ? addMinutesToClockTime(startTime, explicitDurationMinutes)
          : null;
      return {
        startTime,
        ...(derivedEndTime ? { endTime: derivedEndTime } : {}),
        rawTime: singleHourWithHMatch[0]
      };
    }
  }

  // hora simples com minutos: "Ã s 11:30" / "11h30"
  const singleMatch = normalized.match(/\b(?:as\s*)?(\d{1,2})[:h](\d{2})\s*(?:h)?\b/u);
  if (singleMatch) {
    const startTime = `${singleMatch[1].padStart(2, "0")}:${singleMatch[2]}`;
    const explicitDurationMinutes = extractExplicitDurationMinutes(normalized);
    const derivedEndTime =
      explicitDurationMinutes !== null
        ? addMinutesToClockTime(startTime, explicitDurationMinutes)
        : null;
    return {
      startTime,
      ...(derivedEndTime ? { endTime: derivedEndTime } : {}),
      rawTime: singleMatch[0]
    };
  }

  return {};
}

function extractExplicitDurationMinutes(text: string): number | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const durationCandidates = [
    ...collectAnchoredDurationCandidates(
      normalized,
      /\b(?:dur(?:a|ar|ante)|com\s+duracao\s+de|duracao\s+de|que\s+dura)\b([^.!?\n]{0,40})/gu
    ),
    ...collectAnchoredDurationCandidates(
      normalized,
      /\b(?:as|das)\s+\d{1,2}(?:(?::\d{2})|h(?:\d{0,2})?)?\b[^.!?\n]{0,24}?\b(?:com|por)\b([^.!?\n]{0,25})/gu
    ),
    ...collectAnchoredDurationCandidates(
      normalized,
      /\b(?:as|das)\s+\d{1,2}(?:(?::\d{2})|h(?:\d{0,2})?)?\b([^.!?\n]{0,20})/gu
    )
  ];

  for (const candidate of durationCandidates) {
    const parsed = parseDurationExpressionToMinutes(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function extractStandaloneDurationMinutes(text: string): number | null {
  const normalized = normalizeLooseText(text)
    .replace(
      /^(?:e\s+)?(?:com|por|dur(?:a|ar|ante)?|duracao(?:\s+de)?|que\s+dura|vai\s+ser\s+de)\s+/u,
      ""
    )
    .trim();

  return parseDurationExpressionToMinutes(normalized);
}

function collectAnchoredDurationCandidates(text: string, pattern: RegExp): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const candidate = match[1]?.trim();
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parseDurationExpressionToMinutes(value: string): number | null {
  const normalized = normalizeLooseText(value)
    .replace(/^[,:;.\s-]+|[,:;.\s-]+$/gu, "")
    .replace(/\b(?:de|duracao)\s+/gu, "")
    .trim();

  if (!normalized) {
    return null;
  }

  if (/^(?:uma|1)\s+hora\s+e\s+meia(?:\b|$)/u.test(normalized)) {
    return 90;
  }

  if (/^meia\s+hora(?:\b|$)/u.test(normalized)) {
    return 30;
  }

  const compactHourMinuteMatch = normalized.match(
    /^(\d{1,2})\s*h\s*(\d{1,2})\s*(?:m|min|mins|minuto|minutos)?(?:\b|$)/u
  );
  if (compactHourMinuteMatch) {
    const hours = Number.parseInt(compactHourMinuteMatch[1], 10);
    const minutes = Number.parseInt(compactHourMinuteMatch[2], 10);
    if (hours >= 0 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  const hourMinuteWordsMatch = normalized.match(
    /^(\d{1,2})\s*(?:hora|horas)(?:\s+e\s+(\d{1,2})\s*(?:m|min|mins|minuto|minutos))(?:\b|$)/u
  );
  if (hourMinuteWordsMatch) {
    const hours = Number.parseInt(hourMinuteWordsMatch[1], 10);
    const minutes = Number.parseInt(hourMinuteWordsMatch[2], 10);
    if (hours >= 0 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  const minuteOnlyMatch = normalized.match(
    /^(\d{1,3})\s*(?:m|min|mins|minuto|minutos)(?:\b|$)/u
  );
  if (minuteOnlyMatch) {
    const minutes = Number.parseInt(minuteOnlyMatch[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) {
      return minutes;
    }
  }

  if (/^(?:uma|1)\s+hora(?:\b|$)/u.test(normalized)) {
    return 60;
  }

  const hourOnlyMatch = normalized.match(/^(\d{1,2})\s*(?:h|hora|horas)(?:\b|$)/u);
  if (hourOnlyMatch) {
    const hours = Number.parseInt(hourOnlyMatch[1], 10);
    if (Number.isFinite(hours) && hours > 0) {
      return hours * 60;
    }
  }

  return null;
}

function parseShortTimeReply(text: string): string | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (/\bmeia[- ]noite\b/u.test(normalized)) {
    return "00:00";
  }

  if (/\bmeio[- ]dia\b/u.test(normalized)) {
    return "12:00";
  }

  const halfPeriodMatch = normalized.match(
    /\b(?:comeca(?:\s+por\s+volta)?|fica|sera|serÃ¡|vai\s+ser|ate|atÃ©|as|a\s+partir\s+das?|por\s+volta\s+das?)?\s*(\d{1,2})\s+e\s+meia(?:\s+da\s+(manha|tarde|noite)|\s+de\s+(manha|tarde|noite))?\b/u
  );
  if (halfPeriodMatch) {
    const rawHour = parseInt(halfPeriodMatch[1], 10);
    const period = halfPeriodMatch[2] ?? halfPeriodMatch[3] ?? null;
    const hour = adjustHourByPeriod(rawHour, period);
    if (hour !== null) {
      return `${String(hour).padStart(2, "0")}:30`;
    }
  }

  const halfMatch = /^(\d{1,2})\s+e\s+meia$/.exec(normalized);
  if (halfMatch) {
    const hour = parseInt(halfMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:30`;
    }
  }

  const hhmmPeriodMatch = normalized.match(
    /\b(?:comeca(?:\s+por\s+volta)?|fica|sera|serÃ¡|vai\s+ser|ate|atÃ©|as|a\s+partir\s+das?|por\s+volta\s+das?)?\s*(\d{1,2}):(\d{2})(?:\s+da\s+(manha|tarde|noite)|\s+de\s+(manha|tarde|noite))?\b/u
  );
  if (hhmmPeriodMatch) {
    const rawHour = parseInt(hhmmPeriodMatch[1], 10);
    const minute = parseInt(hhmmPeriodMatch[2], 10);
    const period = hhmmPeriodMatch[3] ?? hhmmPeriodMatch[4] ?? null;
    const hour = adjustHourByPeriod(rawHour, period);
    if (hour !== null && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const hhmmMatch = /^(\d{1,2}):(\d{2})$/.exec(normalized);
  if (hhmmMatch) {
    const hour = parseInt(hhmmMatch[1], 10);
    const minute = parseInt(hhmmMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const hPeriodMatch = normalized.match(
    /\b(?:comeca(?:\s+por\s+volta)?|fica|sera|serÃ¡|vai\s+ser|ate|atÃ©|as|a\s+partir\s+das?|por\s+volta\s+das?)?\s*(\d{1,2})h(?:\s+da\s+(manha|tarde|noite)|\s+de\s+(manha|tarde|noite))?\b/u
  );
  if (hPeriodMatch) {
    const rawHour = parseInt(hPeriodMatch[1], 10);
    const period = hPeriodMatch[2] ?? hPeriodMatch[3] ?? null;
    const hour = adjustHourByPeriod(rawHour, period);
    if (hour !== null) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  const hMatch = /^(\d{1,2})h$/.exec(normalized);
  if (hMatch) {
    const hour = parseInt(hMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  const periodHourMatch = normalized.match(
    /\b(?:comeca(?:\s+por\s+volta)?|fica|sera|serÃ¡|vai\s+ser|ate|atÃ©|as|a\s+partir\s+das?|por\s+volta\s+das?)?\s*(\d{1,2})(?:\s+da\s+(manha|tarde|noite)|\s+de\s+(manha|tarde|noite))\b/u
  );
  if (periodHourMatch) {
    const rawHour = parseInt(periodHourMatch[1], 10);
    const period = periodHourMatch[2] ?? periodHourMatch[3] ?? null;
    const hour = adjustHourByPeriod(rawHour, period);
    if (hour !== null) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  const aroundHourMatch = normalized.match(
    /\b(?:por\s+volta\s+das?|cerca\s+das?|mais\s+ou\s+menos\s+as?)\s*(\d{1,2})\b/u
  );
  if (aroundHourMatch) {
    const hour = parseInt(aroundHourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  const hourOnlyMatch = /^(\d{1,2})$/.exec(normalized);
  if (hourOnlyMatch) {
    const hour = parseInt(hourOnlyMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
  }

  return null;
}

function isLikelyStandaloneTimeReply(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.length === 0) {
    return false;
  }

  const compactPatterns = [
    /^\d{1,2}$/u,
    /^\d{1,2}h$/u,
    /^\d{1,2}:\d{2}$/u,
    /^\d{1,2}\s+e\s+meia$/u,
    /^meia[- ]noite$/u,
    /^meio[- ]dia$/u,
    /^por\s+volta\s+das?\s+\d{1,2}$/u,
    /^cerca\s+das?\s+\d{1,2}$/u,
    /^(?:as|ate|atÃ©|fica|comeca|comeÃ§a|vai\s+ate|vai\s+atÃ©)\s+\d{1,2}(?::\d{2})?(?:h)?$/u,
    /^\d{1,2}\s+da\s+(?:manha|tarde|noite)$/u,
    /^\d{1,2}\s+de\s+(?:manha|tarde|noite)$/u,
    /^(?:as|ate|atÃ©|fica|comeca|comeÃ§a|por\s+volta\s+das?)\s+\d{1,2}\s+da\s+(?:manha|tarde|noite)$/u
  ];

  return compactPatterns.some((pattern) => pattern.test(normalized));
}

function adjustHourByPeriod(
  hour: number,
  period: string | null
): number | null {
  if (hour < 0 || hour > 23) {
    return null;
  }

  if (!period) {
    return hour;
  }

  if (period === "manha") {
    if (hour === 12) {
      return 0;
    }
    return hour >= 0 && hour <= 11 ? hour : null;
  }

  if (period === "tarde") {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }
    if (hour === 12) {
      return 12;
    }
    return hour >= 13 && hour <= 23 ? hour : null;
  }

  if (period === "noite") {
    if (hour >= 1 && hour <= 11) {
      return hour + 12;
    }
    if (hour === 12) {
      return 0;
    }
    return hour >= 18 && hour <= 23 ? hour : null;
  }

  return hour;
}

function inferTitleFromContext(
  latestMessage: string,
  extracted: Record<string, unknown>
): string | null {
  const combined = [
    typeof extracted.title === "string" ? extracted.title : "",
    typeof extracted.targetText === "string" ? extracted.targetText : "",
    typeof extracted.description === "string" ? extracted.description : "",
    latestMessage
  ]
    .filter(Boolean)
    .join(" ");

  const meetingWithMatch = combined.match(
    /\breuni[aÃ£]o(?:\s+\w+)*\s+com\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][\p{L}]+)/u
  );
  if (meetingWithMatch) {
    return `Reuniao com ${meetingWithMatch[1]}`;
  }

  const meetingForMatch = combined.match(
    /\breuni[aÃ£]o\s+d[aeo]\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][\p{L}.-]+)/u
  );
  if (meetingForMatch) {
    return `Reuniao para ${meetingForMatch[1]}`;
  }

  const talkWithMatch = combined.match(
    /\bfalar\s+com\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][\p{L}]+)/u
  );
  if (talkWithMatch) {
    return `Reuniao com ${talkWithMatch[1]}`;
  }

  if (/\breuni[aÃ£]o\b/iu.test(combined)) {
    return "Reuniao";
  }

  // "trabalhar [em X]" â†’ "Trabalhar [em X]"
  const workMatch = combined.match(/\btrabalh(?:ar|ando)\b(?:\s+em\s+((?:\w+\s*){1,4}))?\b/iu);
  if (workMatch) {
    const subject = workMatch[1]?.trim().replace(/\s+/g, " ");
    return subject ? `Trabalhar em ${subject}` : "Trabalhar";
  }

  // refeicoes: "almoco", "jantar", etc.
  const combinedNorm = combined.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\bdentista\b/u.test(combinedNorm)) return "Dentista";
  if (/\bconsulta\s+medic[ao]\b/u.test(combinedNorm)) return "Consulta medica";
  if (/\bconsulta\b/u.test(combinedNorm)) return "Consulta";
  if (/\bmedic[oa]\b/u.test(combinedNorm)) return "Consulta medica";
  if (/\baniversari[oa]\b/u.test(combinedNorm)) return "Aniversario";
  if (/\b(?:ginasio|academia|treino|desporto)\b/u.test(combinedNorm)) return "Treino";
  if (/\bferias\b/u.test(combinedNorm)) return "Ferias";
  if (/\bviagem\b/u.test(combinedNorm)) return "Viagem";
  if (/\bpequeno.?almoco\b/u.test(combinedNorm)) return "Pequeno-almoco";
  if (/\bjantar\b/u.test(combinedNorm)) return "Jantar";
  if (/\balmoco\b/u.test(combinedNorm)) return "Almoco";
  if (/\bcafe\b/u.test(combinedNorm)) return "Cafe";

  return null;
}

function inferExplicitEventTypeTitle(message: string): string | null {
  const norm = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\breuniao\b/u.test(norm)) {
    return "Reuniao";
  }
  if (/\btrabalh(?:ar|o|ando)\b/u.test(norm)) {
    return "Trabalho";
  }
  if (/\bdentista\b/u.test(norm)) {
    return "Dentista";
  }
  if (/\bconsulta\s+medic[ao]\b/u.test(norm)) {
    return "Consulta medica";
  }
  if (/\bconsulta\b/u.test(norm)) {
    return "Consulta";
  }
  if (/\bmedic[oa]\b/u.test(norm)) {
    return "Consulta medica";
  }
  if (/\baniversari[oa]\b/u.test(norm)) {
    return "Aniversario";
  }
  if (/\b(?:ginasio|academia|treino|desporto)\b/u.test(norm)) {
    return "Treino";
  }
  if (/\bferias\b/u.test(norm)) {
    return "Ferias";
  }
  if (/\bviagem\b/u.test(norm)) {
    return "Viagem";
  }
  if (/\bpequeno.?almoco\b/u.test(norm)) {
    return "Pequeno-almoco";
  }
  if (/\bjantar\b/u.test(norm)) {
    return "Jantar";
  }
  if (/\balmoco\b/u.test(norm)) {
    return "Almoco";
  }
  if (/\bcafe\b/u.test(norm)) {
    return "Cafe";
  }

  return null;
}

function titleHasSupportInMessage(title: string, message: string): boolean {
  const normalizedTitle = normalizeLooseText(title);
  const normalizedMessage = normalizeLooseText(message);

  if (!normalizedTitle || !normalizedMessage) {
    return false;
  }

  if (normalizedMessage.includes(normalizedTitle)) {
    return true;
  }

  const explicitEventTypeTitle = inferExplicitEventTypeTitle(message);
  if (
    explicitEventTypeTitle &&
    normalizeLooseText(explicitEventTypeTitle) === normalizedTitle
  ) {
    return true;
  }

  const unknownTitle = inferUnknownEventTitle(message);
  if (unknownTitle && normalizeLooseText(unknownTitle) === normalizedTitle) {
    return true;
  }

  const significantTokens = normalizedTitle
    .split(/\s+/u)
    .filter(
      (token) =>
        token.length > 2 &&
        ![
          "com",
          "para",
          "de",
          "da",
          "do",
          "das",
          "dos",
          "em",
          "na",
          "no",
          "um",
          "uma"
        ].includes(token)
    );

  if (significantTokens.length === 0) {
    return false;
  }

  return significantTokens.every((token) =>
    new RegExp(`\\b${escapeRegExp(token)}\\b`, "u").test(normalizedMessage)
  );
}

function isSuspiciousFreshEventTitle(title: string, message: string): boolean {
  const normalizedTitle = normalizeLooseText(title);
  const normalizedMessage = normalizeLooseText(message);

  if (!normalizedTitle) {
    return true;
  }

  const containsSchedulingVerb =
    /\b(?:queria|quero|preciso|gostaria|marcar|agendar|criar|adicionar|evento)\b/u.test(
      normalizedTitle
    );
  const containsTemporalAnchor =
    /\b(?:dia|dias|semana|mes|ano|hoje|amanha|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/u.test(
      normalizedTitle
    ) || /\b\d{1,2}(?::\d{2})?\b/u.test(normalizedTitle);
  const isVeryLong = normalizedTitle.split(/\s+/u).length >= 5;

  if (containsSchedulingVerb) {
    return true;
  }

  if (containsTemporalAnchor && normalizedTitle === normalizedMessage) {
    return true;
  }

  if (containsTemporalAnchor && isVeryLong) {
    return true;
  }

  return false;
}

function normalizeLooseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const controlledCategoryDefinitions = [
  {
    name: "Reuniao",
    aliases: [
      "reuniao",
      "reuniÃ£o",
      "meeting",
      "conferencia",
      "conferÃªncia",
      "workshop",
      "seminario",
      "seminÃ¡rio",
      "palestra",
      "briefing",
      "kickoff",
      "sync"
    ]
  },
  {
    name: "Consulta",
    aliases: [
      "consulta",
      "consukta",
      "consulkta",
      "conuslta",
      "consulta medica",
      "consulta mÃ©dica",
      "dentista",
      "medico",
      "mÃ©dico",
      "hospital",
      "terapia",
      "psicologo",
      "psicÃ³logo",
      "fisioterapia"
    ]
  },
  {
    name: "Trabalho",
    aliases: ["trabalho", "trabalhar", "turno", "servico", "serviÃ§o", "work", "job"]
  },
  {
    name: "Estudo",
    aliases: ["estudo", "estudar", "aula", "faculdade", "universidade", "teste", "exame"]
  },
  {
    name: "Treino",
    aliases: [
      "treino",
      "ginasio",
      "ginÃ¡sio",
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
    aliases: ["viagem", "ferias", "voo", "comboio", "autocarro", "aeroporto", "hotel", "trip"]
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
      "almoÃ§o",
      "pequeno almoco",
      "pequeno-almoco",
      "pequeno almoÃ§o",
      "brunch",
      "cafe",
      "cafÃ©",
      "snack"
    ]
  },
  {
    name: "Aniversario",
    aliases: ["aniversario", "aniversÃ¡rio", "festa de anos", "anos"]
  },
  {
    name: "Outros",
    aliases: ["outro", "outros", "geral", "misc"]
  }
] as const;

function deriveEventCategory(extracted: Record<string, unknown>): string | null {
  const titleCategory =
    typeof extracted.title === "string"
      ? inferControlledCategoryFromText(extracted.title)
      : null;
  if (titleCategory) {
    return titleCategory;
  }

  const explicitCategory =
    typeof extracted.category === "string"
      ? normalizeExplicitCategoryValue(extracted.category)
      : null;
  if (explicitCategory) {
    return explicitCategory;
  }

  const descriptionCategory =
    typeof extracted.description === "string"
      ? inferControlledCategoryFromText(extracted.description)
      : null;
  if (descriptionCategory) {
    return descriptionCategory;
  }

  return null;
}

function isTrustedNormalizedEventTitle(extracted: Record<string, unknown>): boolean {
  const title =
    typeof extracted.title === "string" ? extracted.title : null;
  const category =
    typeof extracted.category === "string" ? extracted.category : null;

  if (!title || !category) {
    return false;
  }

  const titleCategory = inferControlledCategoryFromText(title);
  const explicitCategory = normalizeExplicitCategoryValue(category);

  return Boolean(titleCategory && explicitCategory && titleCategory === explicitCategory);
}

function inferControlledCategoryFromText(text: string): string | null {
  const normalized = normalizeLooseText(text);
  if (!normalized) {
    return null;
  }

  for (const definition of controlledCategoryDefinitions) {
    if (
      definition.aliases.some((alias) => normalized.includes(normalizeLooseText(alias)))
    ) {
      return definition.name;
    }
  }

  return null;
}

function normalizeExplicitCategoryValue(value: string): string | null {
  const controlled = inferControlledCategoryFromText(value);
  if (controlled) {
    return controlled;
  }

  const normalized = normalizeCategoryLabel(value);
  if (!normalized || isGenericCategoryValue(normalized)) {
    return null;
  }

  return normalized;
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

function isGenericCategoryValue(value: string): boolean {
  const normalized = normalizeLooseText(value);
  return (
    normalized.length === 0 ||
    ["categoria", "evento", "agenda", "geral", "misc", "outro", "outros"].includes(
      normalized
    )
  );
}

function improveGenericTitle(title: string, latestMessage: string): string | null {
  const titleNorm = title.trim();
  const msgNorm = latestMessage.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  // Extrair "com Pessoa" da mensagem para usar nos titulos
  const withPersonMatch = latestMessage.match(/\bcom\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][\p{L}]+)/u);
  const withPerson = withPersonMatch ? ` com ${withPersonMatch[1]}` : "";

  // Extrair "de Pessoa" para aniversarios
  const ofPersonMatch = latestMessage.match(/\bde\s+([A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][\p{L}]+)/u);
  const ofPerson = ofPersonMatch ? ` de ${ofPersonMatch[1]}` : "";

  // Titulos genericos que o LLM usa independentemente do tipo de evento
  const isGenericTitle =
    /^(?:reuni[aÃ£]o|encontro|evento|marcac[aÃ£]o|compromisso|atividade|refei[cÃ§][aÃ£]o|tarefa|task)$/iu.test(
      titleNorm
    );

  if (isGenericTitle) {
    // Verificar tipo especifico na mensagem (ordem: mais especifico primeiro)
    if (/\bpequeno.?almo[cÃ§]o\b/u.test(msgNorm)) return `Pequeno-almoco${withPerson}`;
    if (/\balmo[cÃ§]o\b/u.test(msgNorm)) return `Almoco${withPerson}`;
    if (/\bjantar\b/u.test(msgNorm)) return `Jantar${withPerson}`;
    if (/\bcafe\b/u.test(msgNorm)) return `Cafe${withPerson}`;
    if (/\baniversari[oa]\b/u.test(msgNorm)) return `Aniversario${ofPerson}`;
    if (/\bdentista\b/u.test(msgNorm)) return "Dentista";
    if (/\bmedic[oa]\b/u.test(msgNorm)) return "Consulta medica";
    if (/\bconsulta\b/u.test(msgNorm)) return "Consulta";
    if (/\b(?:ginasio|academia|treino|desporto)\b/u.test(msgNorm)) return "Treino";
    if (/\bviagem\b/u.test(msgNorm)) return "Viagem";
    if (/\bferias\b/u.test(msgNorm)) return "Ferias";
    if (/\b(?:tarefa|task)\b/u.test(msgNorm)) return "Tarefa";

    // Reuniao: so manter ou melhorar com "com Pessoa"
    if (/\breuniao\b/u.test(msgNorm)) {
      return withPerson ? `Reuniao${withPerson}` : "Reuniao";
    }
    // Encontro generico mas o utilizador disse "reuniao" â†’ corrigir
    if (/^encontro$/iu.test(titleNorm) && /\breuniao\b/u.test(msgNorm)) {
      return withPerson ? `Reuniao${withPerson}` : "Reuniao";
    }

    // Titulo e Reuniao/Marcacao mas sem tipo especifico na mensagem â†’ melhorar com "com Pessoa"
    if (/^(?:reuni[aÃ£]o|marcac[aÃ£]o|evento|compromisso)$/iu.test(titleNorm) && withPerson) {
      return `Reuniao${withPerson}`;
    }
    return null;
  }

  // Titulo ja especifico mas "Encontro com X" quando utilizador disse "reuniao" â†’ corrigir para Reuniao
  if (/^encontro\s+com\s+/iu.test(titleNorm) && /\breuniao\b/u.test(msgNorm)) {
    return titleNorm.replace(/^Encontro/iu, "Reuniao");
  }

  return null;
}

function inferDescriptionFromContext(text: string): string | null {
  const trailingDescription = extractTrailingDescriptionAfterSchedule(text);
  if (trailingDescription) {
    return trailingDescription;
  }

  const timeData = extractTimeData(text);
  const hasSchedulingAnchor =
    hasNonEmptyValue(timeData.startTime) ||
    hasNonEmptyValue(timeData.endTime) ||
    messageHasTemporalExpression(text);

  const aboutExactMatch = hasSchedulingAnchor ? text.match(/\bsobre\s+(.+)$/iu) : null;
  if (aboutExactMatch) {
    return cleanDescriptionCandidate(aboutExactMatch[1]);
  }

  const aboutMatch = hasSchedulingAnchor ? text.match(/\bpara\s+(.+)$/iu) : null;
  if (aboutMatch) {
    const candidate = cleanDescriptionCandidate(aboutMatch[1]);
    if (!candidate) {
      return null;
    }
    const timeData = extractTimeData(candidate);
    // Nao usar se contem hora (ex: "para Bolsa e vai ser ate as 18:00") ou e puramente temporal
    if (!looksLikeTemporalOnly(candidate) && !timeData.startTime && !timeData.endTime) {
      return candidate;
    }
  }

  return null;
}

function extractTrailingDescriptionAfterSchedule(text: string): string | null {
  const collapsed = text.replace(/\s+/g, " ").trim();

  const patterns = [
    /\b(?:das?|de)\s+\d{1,2}(?::\d{2})?(?:\s*h)?\s+(?:as|Ã s|ate|atÃ©|-)\s+\d{1,2}(?::\d{2})?(?:\s*h)?\b(?<tail>.+)$/iu,
    /\b\d{1,2}(?::\d{2})?(?:\s*h)?\s+(?:as|Ã s|ate|atÃ©|-)\s+\d{1,2}(?::\d{2})?(?:\s*h)?\b(?<tail>.+)$/iu,
    /\b(?:comeca|comeÃ§a|inicia)\s+(?:as|Ã s)?\s*\d{1,2}(?::\d{2})?(?:\s*h)?\b.*?\b(?:termina|acaba|vai\s+ate|vai\s+atÃ©|ate|atÃ©)\s+(?:as|Ã s)?\s*\d{1,2}(?::\d{2})?(?:\s*h)?\b(?<tail>.+)$/iu
  ];

  for (const pattern of patterns) {
    const match = collapsed.match(pattern);
    const candidate = cleanDescriptionCandidate(match?.groups?.tail ?? "");
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function cleanDescriptionCandidate(candidate: string): string | null {
  const cleaned = stripDescriptionPreamble(
    candidate
      .replace(/^[,;:.\-â€“â€”\s]+/u, "")
      .replace(/[.?!\s]+$/u, "")
  );

  if (!cleaned) {
    return null;
  }

  const timeData = extractTimeData(cleaned);
  if (timeData.startTime || timeData.endTime) {
    return null;
  }

  if (looksLikeTemporalOnly(cleaned) || messageHasDateAnchor(cleaned) || isSkipPhrase(cleaned)) {
    return null;
  }

  return cleaned;
}

function hasNonEmptyValue(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function normalizeClockTimeValue(value: unknown): string | null {
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

function parseClockTimeToMinutes(value: string): number | null {
  const normalized = normalizeClockTimeValue(value);
  if (!normalized) {
    return null;
  }

  const [hour, minute] = normalized.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function getClockTimeDurationInMinutes(startTime: string, endTime: string): number | null {
  const startMinutes = parseClockTimeToMinutes(startTime);
  const endMinutes = parseClockTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : null;
}

function addMinutesToClockTime(value: string, minutesToAdd: number): string | null {
  const baseMinutes = parseClockTimeToMinutes(value);
  if (baseMinutes === null || !Number.isFinite(minutesToAdd)) {
    return null;
  }

  const normalizedMinutes = ((baseMinutes + minutesToAdd) % 1440 + 1440) % 1440;
  const hour = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
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

function stripDescriptionPreamble(text: string): string {
  return text
    .replace(/^(?:vai|vou)\s+(?:ser\s+)?(?:estar\s+(?:a\s+)?)?/iu, "")
    .replace(/^(?:Ã©|e)\s+(?:sobre\s+)?/iu, "")
    .trim();
}

function hasExplicitDescriptionSkipInstruction(text: string): boolean {
  const normalized = normalizeLooseText(text);
  if (!normalized) {
    return false;
  }

  return [
    /\bsem\s+(?:qualquer\s+)?(?:descricao|nota|observacoes?|comentario)\b/u,
    /\bsem\s+nada\s+na\s+(?:descricao|nota|observacoes?|comentario)\b/u,
    /\b(?:descricao|nota|observacoes?|comentario)\s+(?:vazia|vazio|em\s+branco)\b/u,
    /\b(?:deixa(?:r)?|podes?\s+deixar|mete(?:r)?|coloca(?:r)?|poe|por)\s+(?:a\s+)?(?:descricao|nota|observacoes?|comentario)\s+(?:vazia|vazio|em\s+branco|sem\s+nada)\b/u,
    /\b(?:nao\s+quero|nao\s+tenho|nao\s+precisa|nao\s+e\s+preciso|nao\s+meter|nao\s+metas|nao\s+colocar|nao\s+coloques)\s+(?:de\s+)?(?:nada\s+na\s+)?(?:descricao|nota|observacoes?|comentario)\b/u
  ].some((pattern) => pattern.test(normalized));
}

function isDescriptionSkipReply(text: string): boolean {
  const normalized = normalizeLooseText(text);
  if (!normalized) {
    return false;
  }

  return (
    isSkipPhrase(text) ||
    hasExplicitDescriptionSkipInstruction(text) ||
    /^(?:sem\s+nada|nao\s+quero\s+nada|nao\s+tenho\s+nada|vazia|vazio|em\s+branco|sem\s+mais\s+nada)$/u.test(
      normalized
    )
  );
}

function isSkipPhrase(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return /^(salta|saltar|pula|pular|skip|sem|nao|nada|ignora|ignorar|deixa|passa|vazio|em\s+branco|none)(\s+.*)?$/u.test(
    normalized
  );
}

function isAffirmativePhrase(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return (
    /^(?:sim|ok|okay|pode|pode\s+ser|claro|certo|otimo|perfeito|exato|exatamente|esse|esse\s+nome|quero|quero\s+esse|ta\s+bem|ta|tudo\s+bem|yeah|yes|yep|sure|born|born\s+assim|born\s+isso)(\s+.*)?$/u.test(
      normalized
    ) ||
    /\b(?:mantem|fica|deixa|manter)\s+(?:esse|isso|assim|este|este\s+nome|esse\s+nome|como\s+esta|como\s+e)\b/u.test(
      normalized
    ) ||
    /^(?:mantem|manter|fica\s+assim|fica\s+esse|deixa\s+assim|deixa\s+esse|esse\s+ta\s+bem|esse\s+esta\s+bem)(\s+.*)?$/u.test(
      normalized
    )
  );
}

function isGenericEventTitle(title: string): boolean {
  return /^(?:reuni[aÃ£]o|encontro|evento|marcac[aÃ£]o|compromisso|atividade|refei[cÃ§][aÃ£]o|tarefa|task)$/iu.test(
    title.trim()
  );
}

function inferUnknownEventTitle(message: string): string | null {
  // Tenta extrair o tipo de evento de padroes comuns em PT quando nao e detetado pela lista
  const patterns = [
    /\b(?:tenho|vou\s+ter)\s+(?:um[a]?\s+)?([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¬Ã®Ã³Ã²Ã´ÃµÃºÃ¹Ã»Ã§A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][^\s,!?.0-9]+)/u,
    /\bmarcar\s+(?:um[a]?\s+)?([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¬Ã®Ã³Ã²Ã´ÃµÃºÃ¹Ã»Ã§A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][^\s,!?.0-9]+)/u,
    /\bmarcac[aÃ£]o\s+de\s+([a-zÃ¡Ã Ã¢Ã£Ã©Ã¨ÃªÃ­Ã¬Ã®Ã³Ã²Ã´ÃµÃºÃ¹Ã»Ã§A-ZÃÃ€Ã‚ÃƒÃ‰ÃˆÃŠÃÃŒÃŽÃ“Ã’Ã”Ã•ÃšÃ™Ã›Ã‡][^\s,!?.0-9]+)/u
  ];
  // Palavras a excluir â€” temporais, artigos, genericos ja tratados
  const excludeNorm =
    /^(?:reuniao|encontro|evento|compromisso|marcacao|atividade|refeicao|tarefa|task|hora|dia|tempo|coisa|algo|ate|para|no|na|um|uma|uns|umas|mes|ano|semana|hoje|amanha|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo|proxim|passad|daqui|minha|meu|uma|marcacao|que|uma)$/u;
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].trim();
      const candidateNorm = candidate
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      if (candidate.length >= 4 && !excludeNorm.test(candidateNorm)) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
      }
    }
  }
  return null;
}

function extractWeekdayHintFromMessage(text: string, today: Date): TemporalHint | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const weekdayMap: Record<string, number> = {
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    domingo: 0
  };
  const explicitWeekAnchor = extractWeekAnchorFromNormalizedText(normalized, today);

  for (const [name, dayNum] of Object.entries(weekdayMap)) {
    if (new RegExp(`\\b${name}(?:-feira)?\\b`, "u").test(normalized)) {
      if (explicitWeekAnchor) {
        const date = resolveWeekdayFromAnchor(explicitWeekAnchor, name);
        return {
          expression: name,
          type: "weekday",
          date: formatIsoDate(date),
          label: formatIsoDate(date)
        };
      }

      const currentDay = today.getUTCDay();
      const originalDiff = dayNum - currentDay; // guardar antes do ajuste base
      let diff = originalDiff;
      if (diff <= 0) diff += 7; // sempre para a proxima ocorrencia futura

      // "proxima quinta" / "proxima segunda":
      // - originalDiff > 0 (dia ainda esta semana): "proxima" = semana seguinte â†’ diff += 7
      // - originalDiff <= 0 (hoje ou ja passou): base +7 ja coloca na proxima ocorrencia, nao adicionar mais
      // NOTA: usar originalDiff e nao diff (ja ajustado) para evitar duplo +7 quando diff era 0
      const hasNextWeekModifier = new RegExp(
        `\\bproxim[ao]\\s+(?:\\w+-feira\\s+)?${name}(?:-feira)?\\b`,
        "u"
      ).test(normalized);
      if (hasNextWeekModifier && originalDiff > 0) {
        diff += 7;
      }

      const date = addDays(today, diff);
      return {
        expression: hasNextWeekModifier ? `proxima ${name}` : name,
        type: "weekday",
        date: formatIsoDate(date),
        label: formatIsoDate(date)
      };
    }
  }
  return null;
}

function extractWeekAnchorFromNormalizedText(text: string, today: Date): Date | null {
  const numericMatch = text.match(/\bdaqui\s+a\s+(\d+)\s+semanas?\b/u);
  if (numericMatch) {
    return addDays(today, Number(numericMatch[1]) * 7);
  }

  if (/\bdaqui\s+a\s+uma\s+semana\b/u.test(text)) {
    return addDays(today, 7);
  }

  if (/\b(?:para\s+a|na)\s+proxima\s+semana\b|\bsemana\s+que\s+vem\b/u.test(text)) {
    return getWeekRange(today, 1).start;
  }

  if (/\besta\s+semana\b/u.test(text)) {
    return getWeekRange(today, 0).start;
  }

  return null;
}

function extractWeekdayFromText(text: string): string | null {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  // Procura nomes de dias da semana no texto da expressao (sem o sufixo "-feira")
  const weekdays = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"];
  for (const wd of weekdays) {
    if (normalized.includes(wd)) {
      return wd;
    }
  }
  return null;
}

function messageHasTemporalExpression(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(hoje|amanha|ontem|segunda|terca|quarta|quinta|sexta|sabado|domingo|semana|mes|ano|proxim|passad|daqui|depois)\b/u.test(
    normalized
  );
}

// Apenas expressoes que ancoram uma DATA especifica (dia concreto).
// Nao inclui "semana", "mes", "ano" que podem aparecer em descricoes (ex: "o que fizemos esta semana").
function messageHasDateAnchor(text: string): boolean {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(hoje|amanha|ontem|depois\s+de\s+amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|proxim[ao]|passad[ao]|daqui\s+a)\b/u.test(
    normalized
  );
}

function isDefaultAssumedTime(
  time: unknown,
  startTime: unknown,
  endTime: unknown
): boolean {
  const hasExplicitRange = hasNonEmptyValue(startTime) || hasNonEmptyValue(endTime);
  if (hasExplicitRange) {
    return false;
  }

  if (typeof time !== "string") {
    return false;
  }

  return time.trim() === "10:00";
}

function isWeakDescription(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (isAllDayPhrase(trimmed) || isDescriptionSkipReply(trimmed) || hasExplicitDescriptionSkipInstruction(trimmed)) {
    return true;
  }

  if (looksLikeTemporalOnly(trimmed)) {
    return true;
  }

  return [
    /\bnao\s+foi\s+fornecid[ao]\b/u,
    /\bnao\s+foi\s+indicad[ao]\b/u,
    /\bsem\s+descricao\b/u,
    /\bdescricao\s+nao\s+fornecid[ao]\b/u,
    /\bnot\s+provided\b/u,
    /\bnot\s+specified\b/u,
    /\buser\s+did\s+not\s+provide\b/u,
    /\butilizador\b.*\bfornecid[ao]\b/u
  ].some((pattern) => pattern.test(normalized));
}

function isSuspiciousDescriptionCandidate(description: string, sourceMessage: string): boolean {
  const normalizedDescription = normalizeLooseText(description);
  const normalizedSource = normalizeLooseText(sourceMessage);

  if (!normalizedDescription) {
    return true;
  }

  if (normalizedDescription === normalizedSource) {
    return true;
  }

  if (
    normalizedSource.includes(normalizedDescription) &&
    messageHasTemporalExpression(description)
  ) {
    return true;
  }

  return false;
}

function isDescriptionEquivalentToTitle(
  description: string,
  title: string | null
): boolean {
  if (!title) {
    return false;
  }

  const normalizedTitle = normalizeLooseText(title);
  if (!normalizedTitle) {
    return false;
  }

  const normalizedDescription = normalizeLooseText(description);
  const strippedDescription = normalizeLooseText(stripDescriptionPreamble(description)).replace(
    /^de\s+/u,
    ""
  );

  if (
    normalizedTitle === "ferias" &&
    /\b(?:estar|estive|estarei|vou estar|ir estar)?\s*(?:em|de)?\s*ferias\b/u.test(
      strippedDescription
    )
  ) {
    return true;
  }

  return (
    normalizedDescription === normalizedTitle ||
    strippedDescription === normalizedTitle
  );
}

function looksLikeTemporalOnly(value: string): boolean {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  const monthAlternation = Object.keys(PT_MONTHS).join("|");

  if (
    new RegExp(
      `^(?:a\\s+|na\\s+|no\\s+|da\\s+|de\\s+)?(?:primeira|segunda|terceira|quarta|quinta|ultima)\\s+semana\\s+de\\s+(?:${monthAlternation})(?:\\s+de\\s+\\d{4}|\\s+do\\s+(?:proximo\\s+ano|ano\\s+que\\s+vem|ano\\s+seguinte|este\\s+ano|deste\\s+ano))?$`,
      "u"
    ).test(normalized)
  ) {
    return true;
  }

  if (
    new RegExp(
      `^(?:de\\s+|desde\\s+|entre\\s+|do\\s+)?(?:dia\\s+)?\\d{1,2}\\s+(?:a|ate|e)\\s+(?:dia\\s+)?\\d{1,2}\\s+de\\s+(?:${monthAlternation})(?:\\s+de\\s+\\d{4}|\\s+do\\s+(?:proximo\\s+ano|ano\\s+que\\s+vem))?$`,
      "u"
    ).test(normalized)
  ) {
    return true;
  }

  if (
    /^(?:de\s+|desde\s+|entre\s+|do\s+)?(?:dia\s+)?\d{1,2}\s+(?:a|ate|e)\s+(?:dia\s+)?\d{1,2}\s+(?:deste\s+mes|do\s+mes\s+atual|do\s+proximo\s+mes|do\s+mes\s+que\s+vem)$/u.test(
      normalized
    )
  ) {
    return true;
  }

  return [
    "hoje",
    "amanha",
    "depois de amanha",
    "ontem",
    "anteontem",
    "esta semana",
    "proxima semana",
    "semana passada"
  ].includes(normalized);
}

function getTitleArticle(titleLower: string): string {
  const norm = titleLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/^ferias/.test(norm)) {
    return "as";
  }
  if (/^(?:almoco|jantar|treino|aniversario|dentista|cafe|trabalho|pequeno-almoco|almoÃ§o)/.test(norm)) {
    return "o";
  }
  return "a";
}

function buildNaturalChatReply(messageContent: string, timestamp: string): string | null {
  const msgNorm = messageContent
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const isEnglish =
    /\b(?:hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening|good\s+night)\b/u.test(
      msgNorm
    );
  const isPtGreeting =
    /\b(?:ola|oi|bom\s+dia|boa\s+tarde|boa\s+noite|boas|tudo\s+bem|como\s+estas)\b/u.test(
      msgNorm
    );

  if (!isEnglish && !isPtGreeting) return null;

  if (isEnglish) {
    let eng = "Hello";
    if (/\bgood\s+morning\b/u.test(msgNorm)) eng = "Good morning";
    else if (/\bgood\s+afternoon\b/u.test(msgNorm)) eng = "Good afternoon";
    else if (/\bgood\s+evening\b|good\s+night\b/u.test(msgNorm)) eng = "Good evening";
    return `${eng}! How can I help you today? I can schedule, look up or delete events in your calendar.`;
  }

  // PT-PT: espelhar a saudacao do utilizador ou escolher pela hora
  let greeting = "Olá";
  if (/\bbom\s+dia\b/u.test(msgNorm)) {
    greeting = "Bom dia";
  } else if (/\bboa\s+tarde\b/u.test(msgNorm)) {
    greeting = "Boa tarde";
  } else if (/\bboa\s+noite\b/u.test(msgNorm)) {
    greeting = "Boa noite";
  } else {
    // Inferir pela hora do sistema
    const hour = new Date(timestamp).getUTCHours();
    if (hour >= 6 && hour < 12) greeting = "Bom dia";
    else if (hour >= 12 && hour < 20) greeting = "Boa tarde";
    else greeting = "Boa noite";
  }

  return `${greeting}! Em que te posso ajudar hoje? Posso marcar, consultar ou eliminar eventos da tua agenda.`;
}

function buildAcknowledgementReply(messageContent: string): string | null {
  const msgNorm = messageContent
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[!?.,]+$/g, "")
    .replace(/\s+/g, " ");

  if (
    /^(?:boa|boa nice|nice|fixe|top|brutal|espetacular|ok|okay|certo|perfeito|otimo|obrigado|obrigada|thanks|thank you|boa obrigado|boa obrigada|ta bem|tudo bem|nice one)$/u.test(
      msgNorm
    )
  ) {
    return "Boa! Se precisares de mais alguma coisa, diz.";
  }

  return null;
}

function beautifyAssistantInterpretation(interpretation: LlmInterpretation): LlmInterpretation {
  return {
    ...interpretation,
    reply: beautifyAssistantText(interpretation.reply),
    followUpQuestion: beautifyAssistantText(interpretation.followUpQuestion)
  };
}

function beautifyAssistantText(text: string): string {
  if (!text) {
    return text;
  }

  const urlPattern = /(https?:\/\/\S+)/giu;
  const exactUrlPattern = /^https?:\/\/\S+$/iu;
  const parts = text.split(urlPattern);

  return parts
    .map((part) => (exactUrlPattern.test(part) ? part : beautifyPortugueseSegment(part)))
    .join("");
}

function beautifyPortugueseSegment(text: string): string {
  const replacements: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /\bdepois de amanha\b/giu, replacement: "depois de amanhã" },
    { pattern: /\bate ao final da semana\b/giu, replacement: "até ao final da semana" },
    { pattern: /\bque periodo queres ver\b/giu, replacement: "que período queres ver" },
    { pattern: /\bde que dia ou periodo\b/giu, replacement: "de que dia ou período" },
    { pattern: /\bproximo mes\b/giu, replacement: "próximo mês" },
    { pattern: /\beste mes\b/giu, replacement: "este mês" },
    { pattern: /\bneste mes\b/giu, replacement: "neste mês" },
    { pattern: /\bnesse mes\b/giu, replacement: "nesse mês" },
    { pattern: /\bproxima semana\b/giu, replacement: "próxima semana" },
    { pattern: /\besta semana\b/giu, replacement: "esta semana" },
    { pattern: /\breuniao\b/giu, replacement: "reunião" },
    { pattern: /\balmoco\b/giu, replacement: "almoço" },
    { pattern: /\bcafe\b/giu, replacement: "café" },
    { pattern: /\bferias\b/giu, replacement: "férias" },
    { pattern: /\baniversario\b/giu, replacement: "aniversário" },
    { pattern: /\bterca-feira\b/giu, replacement: "terça-feira" },
    { pattern: /\bsabado\b/giu, replacement: "sábado" },
    { pattern: /\bmarco\b/giu, replacement: "março" },
    { pattern: /\bamanha\b/giu, replacement: "amanhã" },
    { pattern: /\bnao\b/giu, replacement: "não" },
    { pattern: /\bola\b/giu, replacement: "olá" },
    { pattern: /\bdescricao\b/giu, replacement: "descrição" },
    { pattern: /\bdescricoes\b/giu, replacement: "descrições" },
    { pattern: /\bperiodo\b/giu, replacement: "período" },
    { pattern: /\bperiodos\b/giu, replacement: "períodos" },
    { pattern: /\bconfiguracao\b/giu, replacement: "configuração" },
    { pattern: /\bconfiguracoes\b/giu, replacement: "configurações" },
    { pattern: /\breferencia\b/giu, replacement: "referência" },
    { pattern: /\breferencias\b/giu, replacement: "referências" },
    { pattern: /\bocorrencias\b/giu, replacement: "ocorrências" },
    { pattern: /\bpossivel\b/giu, replacement: "possível" },
    { pattern: /\bcomeca\b/giu, replacement: "começa" },
    { pattern: /\bobservacoes\b/giu, replacement: "observações" },
    { pattern: /\btitulo\b/giu, replacement: "título" },
    { pattern: /\btitulos\b/giu, replacement: "títulos" },
    { pattern: /\bnumeros\b/giu, replacement: "números" },
    { pattern: /\bate\b/giu, replacement: "até" },
    { pattern: /\bha\b/giu, replacement: "há" },
    { pattern: /\btambem\b/giu, replacement: "também" }
  ];

  let result = text;
  for (const { pattern, replacement } of replacements) {
    result = result.replace(pattern, (match) => applyReplacementCase(match, replacement));
  }
  return result;
}

function applyReplacementCase(match: string, replacement: string): string {
  if (match.toUpperCase() === match) {
    return replacement.toUpperCase();
  }

  if (match.charAt(0) === match.charAt(0).toUpperCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }

  return replacement;
}

function buildCreateEventConfirmation(extracted: Record<string, unknown>): string {
  const title = typeof extracted.title === "string" ? extracted.title : "o evento";
  const date = typeof extracted.date === "string" ? extracted.date : "";
  const endDate = typeof extracted.endDate === "string" ? extracted.endDate : "";
  const rawDate = typeof extracted.rawDate === "string" ? extracted.rawDate : "";
  const startTime =
    typeof extracted.startTime === "string"
      ? extracted.startTime
      : typeof extracted.time === "string"
        ? extracted.time
        : "";
  const endTime = typeof extracted.endTime === "string" ? extracted.endTime : "";
  const allDay = extracted.allDay === true;
  const description =
    typeof extracted.description === "string" ? extracted.description : "";

  let reply = `Perfeito. Registei ${title}`;

  if (date && endDate && allDay) {
    reply += ` de ${formatFriendlyDate(date)} a ${formatFriendlyDate(endDate)}`;
  } else if (date) {
    if (rawDate) {
      const cleanRaw = rawDate.replace(/^para\s+/iu, "").trim();
      reply += ` para ${cleanRaw} (${formatShortDate(date)})`;
    } else {
      reply += ` para ${formatFriendlyDate(date)}`;
    }
  }

  if (startTime && endTime) {
    reply += `, das ${startTime} as ${endTime}`;
  } else if (startTime) {
    reply += `, as ${startTime}`;
  } else if (allDay) {
    reply += `, dia todo`;
  }

  if (description) {
    const descNormalized = description.replace(/^sobre\s+/iu, "").trim();
    const descLower = descNormalized.charAt(0).toLowerCase() + descNormalized.slice(1);
    // Nao repetir a descricao se for igual ao titulo (LLM duplicou)
    if (descLower.toLowerCase() !== title.toLowerCase()) {
      reply += `, sobre ${descLower}`;
    }
  }

  return `${reply}.`;
}

function formatShortDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  return `${parts[2]}/${parts[1]}`;
}

function formatFriendlyDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) {
    return isoDate;
  }
  const [year, month, day] = parts;
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];
  const weekdayNames = [
    "domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado"
  ];
  const date = parseIsoDate(isoDate);
  const weekday = weekdayNames[date.getUTCDay()];
  const monthName = monthNames[Number(month) - 1] ?? month;
  return `${weekday}, ${day} de ${monthName} de ${year}`;
}

function normalizeSentenceCase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

async function updatePendingCommand(
  message: DiscordMessageInput,
  interpretation: LlmInterpretation
): Promise<void> {
  const shouldStorePending =
    interpretation.hasCommand &&
    interpretation.command !== "chat" &&
    interpretation.command !== "unknown" &&
    (!interpretation.isComplete || interpretation.shouldAskFollowUp);

  if (shouldStorePending) {
    await savePendingCommand(message.channelId, {
      command: interpretation.command,
      extractedData: interpretation.extractedData,
      missingFields: interpretation.missingFields,
      lastUserMessage: message.content,
      followUpQuestion: interpretation.followUpQuestion,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  const shouldClearPending =
    interpretation.command === "chat" ||
    interpretation.command === "unknown" ||
    (interpretation.hasCommand && interpretation.isComplete);

  if (shouldClearPending) {
    await clearPendingCommand(message.channelId);
  }
}

async function getPendingCommandState(
  channelId: string,
  referenceTime: Date = new Date()
): Promise<PendingCommand | null> {
  const result = await pool.query(
    `
      SELECT
        command,
        extracted_data,
        missing_fields,
        last_user_message,
        follow_up_question,
        updated_at
      FROM pending_commands
      WHERE channel_id = $1
    `,
    [channelId]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const pending = {
    command: row.command as PendingCommand["command"],
    extractedData: row.extracted_data as Record<string, unknown>,
    missingFields: Array.isArray(row.missing_fields)
      ? (row.missing_fields as string[])
      : [],
    lastUserMessage: row.last_user_message as string,
    followUpQuestion: row.follow_up_question as string,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  };

  if (isTimestampOlderThanWindow(pending.updatedAt, referenceTime, env.contextTtlMs)) {
    await clearPendingCommand(channelId);
    return null;
  }

  return pending;
}

function buildMissingDataQuestion(interpretation: LlmInterpretation): string {
  if (interpretation.command === "create_event") {
    const m = interpretation.missingFields;
    const missingTitle = m.includes("title");
    const missingDate = m.includes("date");
    const missingStart = m.includes("startTime") || m.includes("time");
    const missingEnd = m.includes("endTime");

    // Usar o titulo para personalizar as perguntas quando disponivel
    const titleStr =
      typeof interpretation.extractedData?.title === "string"
        ? interpretation.extractedData.title
        : null;
    const titleLower = titleStr
      ? titleStr.charAt(0).toLowerCase() + titleStr.slice(1)
      : null;
    const article = titleLower ? getTitleArticle(titleLower) : "o";
    const eventRef = titleLower ? `${article} ${titleLower}` : "o evento";

    // Combinar campos relacionados para reduzir o numero de perguntas
    if (missingTitle && missingDate && (missingStart || missingEnd)) {
      return "Para que dia e a que horas e o evento, e qual o nome?";
    }
    if (missingTitle && missingDate) {
      return "Para que dia queres marcar e qual o nome do evento?";
    }
    if (missingTitle && missingStart && missingEnd) {
      return "Qual o nome do evento e a que horas comeca e termina?";
    }
    if (missingTitle && missingEnd) {
      return "Qual o nome do evento e ate que horas vai durar?";
    }
    if (missingTitle) {
      return "Que nome queres dar ao evento?";
    }
    if (missingDate && (missingStart || missingEnd)) {
      return `Para que dia e a que horas e ${eventRef}?`;
    }
    if (missingDate) {
      return `Para que dia queres marcar ${eventRef}?`;
    }
    if (missingStart && missingEnd) {
      return "A que horas comeca e a que horas termina?";
    }
    if (missingStart) {
      return "A que horas comeca?";
    }
    if (missingEnd) {
      return "E ate que horas vai durar?";
    }
    if (m.includes("description")) {
      return "Tens alguma nota a acrescentar? (podes 'saltar' se quiseres)";
    }
  }

  if (interpretation.command === "list_events") {
    return "De que dia ou periodo queres ver os eventos? Podes dizer hoje, amanha, ate ao final da semana ou este mes.";
  }

  if (interpretation.command === "delete_event") {
    return "Que evento queres eliminar?";
  }

  if (interpretation.command === "update_event") {
    return "Que evento queres alterar e para quando?";
  }

  return "Podes dizer-me melhor o que queres fazer na tua agenda?";
}

async function getConversationHistory(
  channelId: string,
  limit = env.historyLimit
): Promise<ConversationMessage[]> {
  const result = await pool.query(
    `
      SELECT role, content, timestamp
      FROM conversation_messages
      WHERE channel_id = $1
      ORDER BY timestamp DESC, id DESC
      LIMIT $2
    `,
    [channelId, limit]
  );

  return result.rows
    .map((row) => ({
      role: row.role as ConversationMessage["role"],
      content: row.content as string,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp)
    }))
    .reverse();
}

async function appendConversationMessage(
  channelId: string,
  message: ConversationMessage
): Promise<void> {
  await pool.query(
    `
      INSERT INTO conversation_messages (channel_id, role, content, timestamp)
      VALUES ($1, $2, $3, $4::timestamptz)
    `,
    [channelId, message.role, message.content, message.timestamp]
  );
}

async function savePendingCommand(
  channelId: string,
  pending: PendingCommand
): Promise<void> {
  await pool.query(
    `
      INSERT INTO pending_commands (
        channel_id,
        command,
        extracted_data,
        missing_fields,
        last_user_message,
        follow_up_question,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7::timestamptz)
      ON CONFLICT (channel_id)
      DO UPDATE SET
        command = EXCLUDED.command,
        extracted_data = EXCLUDED.extracted_data,
        missing_fields = EXCLUDED.missing_fields,
        last_user_message = EXCLUDED.last_user_message,
        follow_up_question = EXCLUDED.follow_up_question,
        updated_at = EXCLUDED.updated_at
    `,
    [
      channelId,
      pending.command,
      JSON.stringify(pending.extractedData),
      JSON.stringify(pending.missingFields),
      pending.lastUserMessage,
      pending.followUpQuestion,
      pending.updatedAt
    ]
  );
}

async function clearPendingCommand(channelId: string): Promise<boolean> {
  const result = await pool.query(
    `
      DELETE FROM pending_commands
      WHERE channel_id = $1
    `,
    [channelId]
  );

  return (result.rowCount ?? 0) > 0;
}

async function purgeConversationData(
  channelId: string
): Promise<{ deletedMessages: number; clearedPending: boolean }> {
  const deletedMessagesResult = await pool.query(
    `
      DELETE FROM conversation_messages
      WHERE channel_id = $1
    `,
    [channelId]
  );

  const clearedPending = await clearPendingCommand(channelId);

  return {
    deletedMessages: deletedMessagesResult.rowCount ?? 0,
    clearedPending
  };
}

async function initializeDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_channel_timestamp
    ON conversation_messages (channel_id, timestamp DESC, id DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_commands (
      channel_id TEXT PRIMARY KEY,
      command TEXT NOT NULL,
      extracted_data JSONB NOT NULL,
      missing_fields JSONB NOT NULL,
      last_user_message TEXT NOT NULL,
      follow_up_question TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);
}

function isAgendaScopedChatReply(reply: string): boolean {
  const normalizedReply = reply.toLowerCase();

  return (
    normalizedReply.includes("agenda") ||
    normalizedReply.includes("evento") ||
    normalizedReply.includes("marcar") ||
    normalizedReply.includes("consultar") ||
    normalizedReply.includes("eliminar")
  );
}

function getTimeContext(): {
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
}
function getTimeContext(referenceTime: Date): {
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
}
function getTimeContext(referenceTime = new Date()): {
  currentDateTime: string;
  currentDate: string;
  currentTime: string;
} {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: env.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(referenceTime);
  const getPart = (type: string): string => {
    return parts.find((part) => part.type === type)?.value ?? "00";
  };

  const currentDate = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const currentTime = `${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;

  return {
    currentDateTime: `${currentDate}T${currentTime}`,
    currentDate,
    currentTime
  };
}

function resolveTemporalHintsFromExpressions(
  expressions: TemporalExpression[],
  currentDate: string
): TemporalHint[] {
  const hints: TemporalHint[] = [];
  const today = parseIsoDate(currentDate);

  for (const expression of expressions) {
    if (expression.kind === "relative_day") {
      const amount = expression.amount ?? 0;
      const signedAmount =
        expression.direction === "past"
          ? -amount
          : expression.direction === "future"
            ? amount
            : 0;
      const date = addDays(today, signedAmount);
      hints.push({
        expression: expression.text,
        type: "date",
        date: formatIsoDate(date),
        label: formatIsoDate(date)
      });
      continue;
    }

    if (expression.kind === "relative_range" || expression.kind === "relative_offset") {
      const amount = expression.amount ?? 1;

      if (expression.unit === "day") {
        const signedAmount =
          expression.direction === "past"
            ? -amount
            : expression.direction === "future"
              ? amount
              : 0;
        const date = addDays(today, signedAmount);
        hints.push({
          expression: expression.text,
          type: "date",
          date: formatIsoDate(date),
          label: formatIsoDate(date)
        });
        continue;
      }

      if (expression.unit === "week") {
        const weekOffset =
          expression.direction === "past"
            ? -amount
            : expression.direction === "future"
              ? amount
              : 0;
        const range = getWeekRange(today, weekOffset);
        hints.push({
          expression: expression.text,
          type: "range",
          startDate: formatIsoDate(range.start),
          endDate: formatIsoDate(range.end),
          label: `${formatIsoDate(range.start)} a ${formatIsoDate(range.end)}`
        });
        continue;
      }

      if (expression.unit === "month") {
        const monthOffset =
          expression.direction === "past"
            ? -amount
            : expression.direction === "future"
              ? amount
              : 0;
        const targetMonth = new Date(
          Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1)
        );
        const range = getMonthRange(
          targetMonth.getUTCFullYear(),
          targetMonth.getUTCMonth()
        );
        hints.push({
          expression: expression.text,
          type: "range",
          startDate: formatIsoDate(range.start),
          endDate: formatIsoDate(range.end),
          label: `${formatIsoDate(range.start)} a ${formatIsoDate(range.end)}`
        });
        continue;
      }

      if (expression.unit === "year") {
        const yearOffset =
          expression.direction === "past"
            ? -amount
            : expression.direction === "future"
              ? amount
              : 0;
        const year = today.getUTCFullYear() + yearOffset;
        hints.push({
          expression: expression.text,
          type: "range",
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
          label: `${year}-01-01 a ${year}-12-31`
        });
        continue;
      }
    }

    if (expression.kind === "weekday" && expression.weekday) {
      // Validar o weekday do modelo contra o texto original â€” o modelo pode ter enviado
      // o nome errado (ex: "terca" quando o utilizador disse "quinta").
      // Se o texto da expressao contem um nome de dia reconhecivel, usa esse.
      const weekdayFromText = extractWeekdayFromText(expression.text);
      const resolvedWeekday = weekdayFromText ?? expression.weekday;

      // Verifica se existe uma expressao de semana no mesmo conjunto (ex: "daqui a uma semana na quarta")
      const weekAnchorExpression = expressions.find(
        (e) =>
          e !== expression &&
          (e.kind === "relative_range" || e.kind === "relative_offset") &&
          e.unit === "week"
      );

      let date: Date;
      if (weekAnchorExpression) {
        // Ancora o weekday na semana do offset (ex: quarta da semana seguinte)
        const weekOffset = weekAnchorExpression.amount ?? 1;
        const signedOffset =
          weekAnchorExpression.direction === "past" ? -weekOffset : weekOffset;
        const anchor = addDays(today, signedOffset * 7);
        date = resolveWeekdayFromAnchor(anchor, resolvedWeekday);
      } else {
        date = resolveWeekdayDate(today, resolvedWeekday, expression.direction);
      }

      hints.push({
        expression: expression.text,
        type: "weekday",
        date: formatIsoDate(date),
        label: formatIsoDate(date)
      });
      continue;
    }

    if (expression.kind === "month" && expression.month) {
      const monthIndex = monthNameToIndex(expression.month);
      const year = today.getUTCFullYear();
      const range = getMonthRange(year, monthIndex);
      hints.push({
        expression: expression.text,
        type: "month",
        startDate: formatIsoDate(range.start),
        endDate: formatIsoDate(range.end),
        label: `${formatIsoDate(range.start)} a ${formatIsoDate(range.end)}`
      });
      continue;
    }

    if (expression.kind === "year") {
      const amount = expression.amount ?? 1;
      const yearOffset =
        expression.direction === "past"
          ? -amount
          : expression.direction === "future"
            ? amount
            : 0;
      const year = today.getUTCFullYear() + yearOffset;
      hints.push({
        expression: expression.text,
        type: "range",
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        label: `${year}-01-01 a ${year}-12-31`
      });
    }
  }

  return dedupeTemporalHints(hints);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// Extrai data explicita no formato D/M, D/M/YYYY, D/M/YY (PT: dia primeiro, depois mes)
// Valida que o dia e mes existem. Se nao tiver ano usa currentYear.
const PT_MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12
};

function validateAndFormatDate(
  day: number,
  month: number,
  year: number,
  raw: string
): { date: string; raw: string } | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { date: formatIsoDate(candidate), raw };
}

function validateAndFormatDateRange(
  startDay: number,
  endDay: number,
  month: number,
  year: number,
  raw: string
): { startDate: string; endDate: string; raw: string } | null {
  if (
    !Number.isFinite(startDay) ||
    !Number.isFinite(endDay) ||
    startDay < 1 ||
    endDay < 1 ||
    startDay > endDay
  ) {
    return null;
  }

  const startCandidate = new Date(Date.UTC(year, month - 1, startDay));
  const endCandidate = new Date(Date.UTC(year, month - 1, endDay));
  if (
    startCandidate.getUTCMonth() !== month - 1 ||
    startCandidate.getUTCDate() !== startDay ||
    endCandidate.getUTCMonth() !== month - 1 ||
    endCandidate.getUTCDate() !== endDay
  ) {
    return null;
  }

  return {
    startDate: formatIsoDate(startCandidate),
    endDate: formatIsoDate(endCandidate),
    raw
  };
}

function getLastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function resolveRelativeYearSpecifier(
  specifier: string | undefined,
  currentYear: number
): number {
  if (!specifier) {
    return currentYear;
  }

  const normalized = specifier
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (
    normalized === "proximo ano" ||
    normalized === "ano que vem" ||
    normalized === "ano seguinte"
  ) {
    return currentYear + 1;
  }

  if (normalized === "este ano" || normalized === "deste ano") {
    return currentYear;
  }

  return currentYear;
}

// Extrai data explicita no formato D/M, D/M/YYYY (formato PT: dia primeiro, depois mes)
function extractExplicitDateFromMessage(
  text: string,
  currentYear: number
): { date: string; raw: string } | null {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/u);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const yearRaw = match[3];
  let year = currentYear;
  if (yearRaw) {
    year = yearRaw.length === 2 ? 2000 + parseInt(yearRaw, 10) : parseInt(yearRaw, 10);
  }

  return validateAndFormatDate(day, month, year, match[0]);
}

// Extrai data escrita por extenso em PT: "30 de abril", "dia 30 de abril", "em abril dia 30"
// "dia 25 do proximo mes" / "dia 25 do mes passado" / "25 do mes que vem"
function extractRelativeMonthDateFromMessage(
  text: string,
  today: Date
): { date: string; raw: string } | null {
  const norm = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const currentMonth = today.getUTCMonth(); // 0-indexed
  const currentYear = today.getUTCFullYear();

  let match: RegExpMatchArray | null;

  // "dia 25 do proximo mes" / "25 do proximo mes" / "25 do mes que vem" / "25 do mes a seguir"
  match = norm.match(
    /\b(?:dia\s+)?(\d{1,2})\s*do\s+(?:proximo\s+mes|mes\s+(?:que\s+vem|a\s+seguir))\b/u
  );
  if (match) {
    const day = parseInt(match[1], 10);
    // Date.UTC com month=currentMonth+1 trata automaticamente o wrap para Janeiro do ano seguinte
    const nextMonthFirst = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
    return validateAndFormatDate(
      day,
      nextMonthFirst.getUTCMonth() + 1,
      nextMonthFirst.getUTCFullYear(),
      match[0]
    );
  }

  // "dia 25 do mes passado" / "25 do mes anterior" / "25 do mes que passou"
  match = norm.match(
    /\b(?:dia\s+)?(\d{1,2})\s*do\s+mes\s+(?:passado|anterior|que\s+passou)\b/u
  );
  if (match) {
    const day = parseInt(match[1], 10);
    // Date.UTC com month=currentMonth-1 trata automaticamente o wrap para Dezembro do ano anterior
    const prevMonthFirst = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
    return validateAndFormatDate(
      day,
      prevMonthFirst.getUTCMonth() + 1,
      prevMonthFirst.getUTCFullYear(),
      match[0]
    );
  }

  return null;
}

function resolveDeterministicDateFromMessage(
  text: string,
  currentDate: string
): { date: string; raw: string } | null {
  const today = parseIsoDate(currentDate);
  const currentYear = today.getUTCFullYear();
  const explicitDate =
    extractExplicitDateFromMessage(text, currentYear) ??
    extractWrittenDateFromMessage(text, currentYear) ??
    extractRelativeMonthDateFromMessage(text, today) ??
    extractDayOnlyDateFromMessage(text, today);

  if (explicitDate) {
    return explicitDate;
  }

  const weekdayHint = extractWeekdayHintFromMessage(text, today);
  if (weekdayHint?.date) {
    return {
      date: weekdayHint.date,
      raw: weekdayHint.expression
    };
  }

  const relativeWeekAnchor = resolveRelativeWeekAnchorDateFromMessage(text, currentDate);
  if (relativeWeekAnchor) {
    return relativeWeekAnchor;
  }

  const normalizedText = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\bhoje\b/u.test(normalizedText)) {
    return { date: currentDate, raw: "hoje" };
  }
  if (/\bdepois\s+de\s+amanha\b/u.test(normalizedText)) {
    return { date: formatIsoDate(addDays(today, 2)), raw: "depois de amanha" };
  }
  if (/\bamanha\b/u.test(normalizedText)) {
    return { date: formatIsoDate(addDays(today, 1)), raw: "amanha" };
  }
  if (/\bontem\b/u.test(normalizedText)) {
    return { date: formatIsoDate(addDays(today, -1)), raw: "ontem" };
  }

  return null;
}

function resolveRelativeWeekAnchorDateFromMessage(
  text: string,
  currentDate: string
): { date: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const today = parseIsoDate(currentDate);

  if (/\b(?:para\s+a|na)\s+proxima\s+semana\b|\bsemana\s+que\s+vem\b/u.test(normalized)) {
    return {
      date: formatIsoDate(getWeekRange(today, 1).start),
      raw: "proxima semana"
    };
  }

  if (/\bpara\s+a\s+semana\b/u.test(normalized)) {
    return {
      date: formatIsoDate(getWeekRange(today, 1).start),
      raw: "para a semana"
    };
  }

  if (/\besta\s+semana\b/u.test(normalized)) {
    return {
      date: formatIsoDate(getWeekRange(today, 0).start),
      raw: "esta semana"
    };
  }

  const numericMatch = normalized.match(/\bdaqui\s+a\s+(\d+)\s+semanas?\b/u);
  if (numericMatch) {
    const anchor = addDays(today, Number(numericMatch[1]) * 7);
    return {
      date: formatIsoDate(getWeekRange(anchor, 0).start),
      raw: numericMatch[0]
    };
  }

  if (/\bdaqui\s+a\s+uma\s+semana\b/u.test(normalized)) {
    const anchor = addDays(today, 7);
    return {
      date: formatIsoDate(getWeekRange(anchor, 0).start),
      raw: "daqui a uma semana"
    };
  }

  return null;
}

function resolveDeterministicDateRangeFromMessage(
  text: string,
  currentDate: string
): { startDate: string; endDate: string; raw: string } | null {
  const today = parseIsoDate(currentDate);

  const explicitWrittenRange =
    extractOrdinalWeekOfMonthRangeFromMessage(text, today) ??
    extractWrittenMonthDateRangeFromMessage(text, today) ??
    extractRelativeMonthDateRangeFromMessage(text, today) ??
    extractDayOnlyDateRangeFromMessage(text, today);

  return explicitWrittenRange;
}

function extractWrittenDateFromMessage(
  text: string,
  currentYear: number
): { date: string; raw: string } | null {
  const norm = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const monthPat = Object.keys(PT_MONTHS).join("|");
  const relativeYearPat =
    "(proximo\\s+ano|ano\\s+que\\s+vem|ano\\s+seguinte|este\\s+ano|deste\\s+ano)";

  // "30 de abril" / "dia 30 de abril" / "30 de abril de 2026"
  let match = norm.match(
    new RegExp(
      `\\b(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${monthPat})(?:\\s+de\\s+(\\d{4}))?(?:\\s+do\\s+${relativeYearPat})?\\b`,
      "u"
    )
  );
  if (match) {
    const day = parseInt(match[1], 10);
    const monthNum = PT_MONTHS[match[2]] ?? 0;
    const year = match[3]
      ? parseInt(match[3], 10)
      : resolveRelativeYearSpecifier(match[4], currentYear);
    return validateAndFormatDate(day, monthNum, year, match[0]);
  }

  // "em abril dia 30" / "em abril 30"
  match = norm.match(
    new RegExp(
      `\\bem\\s+(${monthPat})(?:\\s+do\\s+${relativeYearPat})?\\s+(?:dia\\s+)?(\\d{1,2})\\b`,
      "u"
    )
  );
  if (match) {
    const monthNum = PT_MONTHS[match[1]] ?? 0;
    const day = parseInt(match[3], 10);
    const year = resolveRelativeYearSpecifier(match[2], currentYear);
    return validateAndFormatDate(day, monthNum, year, match[0]);
  }

  // "abril 30" / "abril dia 30"
  match = norm.match(
    new RegExp(
      `\\b(${monthPat})(?:\\s+do\\s+${relativeYearPat})?\\s+(?:dia\\s+)?(\\d{1,2})\\b`,
      "u"
    )
  );
  if (match) {
    const monthNum = PT_MONTHS[match[1]] ?? 0;
    const day = parseInt(match[3], 10);
    const year = resolveRelativeYearSpecifier(match[2], currentYear);
    return validateAndFormatDate(day, monthNum, year, match[0]);
  }

  return null;
}

function extractWrittenMonthDateRangeFromMessage(
  text: string,
  today: Date
): { startDate: string; endDate: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const monthAlternation = Object.keys(PT_MONTHS).join("|");
  const match = normalized.match(
    new RegExp(
      `\\b(?:de|desde|entre|do)\\s+(?:dia\\s+)?(\\d{1,2})\\s+(?:a|ate|e)\\s+(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${monthAlternation})(?:\\s+de\\s+(\\d{4})|\\s+do\\s+proximo\\s+ano|\\s+do\\s+ano\\s+que\\s+vem)?\\b`,
      "u"
    )
  );
  if (!match) {
    return null;
  }

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  const monthIndex = monthNameToIndex(match[3]);
  if (monthIndex < 0) {
    return null;
  }

  let year = match[4] ? Number(match[4]) : today.getUTCFullYear();
  if (!match[4]) {
    if (/\bdo\s+proximo\s+ano\b|\bdo\s+ano\s+que\s+vem\b/u.test(match[0])) {
      year += 1;
    } else {
      const candidate = validateAndFormatDateRange(startDay, endDay, monthIndex + 1, year, match[0]);
      if (candidate && parseIsoDate(candidate.endDate).getTime() < today.getTime()) {
        year += 1;
      }
    }
  }

  return validateAndFormatDateRange(startDay, endDay, monthIndex + 1, year, match[0]);
}

function extractOrdinalWeekOfMonthRangeFromMessage(
  text: string,
  today: Date
): { startDate: string; endDate: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const monthAlternation = Object.keys(PT_MONTHS).join("|");
  const relativeYearPat =
    "(proximo\\s+ano|ano\\s+que\\s+vem|ano\\s+seguinte|este\\s+ano|deste\\s+ano)";
  const match = normalized.match(
    new RegExp(
      `\\b(?:para\\s+|na\\s+|no\\s+|da\\s+|de\\s+)?(?:a\\s+)?(primeira|segunda|terceira|quarta|quinta|ultima)\\s+semana\\s+de\\s+(${monthAlternation})(?:\\s+de\\s+(\\d{4}))?(?:\\s+do\\s+${relativeYearPat})?\\b`,
      "u"
    )
  );
  if (!match) {
    return null;
  }

  const ordinal = match[1];
  const monthIndex = monthNameToIndex(match[2]);
  if (monthIndex < 0) {
    return null;
  }

  let year = match[3]
    ? Number(match[3])
    : resolveRelativeYearSpecifier(match[4], today.getUTCFullYear());

  const buildRangeForYear = (targetYear: number) => {
    const lastDay = getLastDayOfMonth(targetYear, monthIndex);
    if (ordinal === "ultima") {
      const totalChunks = Math.ceil(lastDay / 7);
      const startDay = 1 + (totalChunks - 1) * 7;
      return validateAndFormatDateRange(startDay, lastDay, monthIndex + 1, targetYear, match[0]);
    }

    const ordinalIndexMap: Record<string, number> = {
      primeira: 0,
      segunda: 1,
      terceira: 2,
      quarta: 3,
      quinta: 4
    };
    const ordinalIndex = ordinalIndexMap[ordinal];
    if (typeof ordinalIndex !== "number") {
      return null;
    }

    const startDay = 1 + ordinalIndex * 7;
    if (startDay > lastDay) {
      return null;
    }

    const endDay = Math.min(startDay + 6, lastDay);
    return validateAndFormatDateRange(startDay, endDay, monthIndex + 1, targetYear, match[0]);
  };

  let candidate = buildRangeForYear(year);
  if (!candidate) {
    return null;
  }

  if (!match[3] && !match[4] && parseIsoDate(candidate.endDate).getTime() < today.getTime()) {
    year += 1;
    candidate = buildRangeForYear(year);
  }

  return candidate;
}

function extractRelativeMonthDateRangeFromMessage(
  text: string,
  today: Date
): { startDate: string; endDate: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const match = normalized.match(
    /\b(?:de|desde|entre|do)\s+(?:dia\s+)?(\d{1,2})\s+(?:a|ate|e)\s+(?:dia\s+)?(\d{1,2})\s+(deste\s+mes|do\s+mes\s+atual|do\s+proximo\s+mes|do\s+mes\s+que\s+vem)\b/u
  );
  if (!match) {
    return null;
  }

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  const modifier = match[3];
  const monthOffset = /\bproximo\s+mes\b|\bmes\s+que\s+vem\b/u.test(modifier) ? 1 : 0;
  const target = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1)
  );

  return validateAndFormatDateRange(
    startDay,
    endDay,
    target.getUTCMonth() + 1,
    target.getUTCFullYear(),
    match[0]
  );
}

function extractDayOnlyDateRangeFromMessage(
  text: string,
  today: Date
): { startDate: string; endDate: string; raw: string } | null {
  const normalized = normalizeLooseText(text);
  const match = normalized.match(
    /\b(?:de|desde|entre|do)\s+(?:dia\s+)?(\d{1,2})\s+(?:a|ate|e)\s+(?:dia\s+)?(\d{1,2})\b/u
  );
  if (!match) {
    return null;
  }

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  if (endDay < startDay) {
    return null;
  }

  const candidates = [
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1))
  ];

  for (const candidateMonth of candidates) {
    const candidate = validateAndFormatDateRange(
      startDay,
      endDay,
      candidateMonth.getUTCMonth() + 1,
      candidateMonth.getUTCFullYear(),
      match[0]
    );
    if (!candidate) {
      continue;
    }

    if (parseIsoDate(candidate.endDate).getTime() >= today.getTime()) {
      return candidate;
    }
  }

  return null;
}

function extractDayOnlyDateFromMessage(
  text: string,
  today: Date
): { date: string; raw: string } | null {
  const norm = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const match = norm.match(/\b(?:no\s+)?dia\s+(\d{1,2})\b/u);
  if (!match) {
    return null;
  }

  if (
    /\b(?:dia\s+\d{1,2}\s+de|dia\s+\d{1,2}\s*\/|\bdia\s+\d{1,2}\s*do\s+(?:proximo\s+mes|mes\s+(?:que\s+vem|a\s+seguir)|mes\s+(?:passado|anterior|que\s+passou)))\b/u.test(
      norm
    )
  ) {
    return null;
  }

  const day = parseInt(match[1], 10);
  if (Number.isNaN(day) || day < 1 || day > 31) {
    return null;
  }

  const todayIso = formatIsoDate(today);
  const candidateMonths = [
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1))
  ];

  for (const monthAnchor of candidateMonths) {
    const candidate = validateAndFormatDate(
      day,
      monthAnchor.getUTCMonth() + 1,
      monthAnchor.getUTCFullYear(),
      match[0]
    );
    if (!candidate) {
      continue;
    }

    if (parseIsoDate(candidate.date).getTime() >= parseIsoDate(todayIso).getTime()) {
      return candidate;
    }
  }

  return null;
}

function getWeekRange(
  date: Date,
  weekOffset: number
): { start: Date; end: Date } {
  const base = addDays(date, weekOffset * 7);
  const day = base.getUTCDay() === 0 ? 7 : base.getUTCDay();
  const start = addDays(base, 1 - day);
  const end = addDays(start, 6);
  return { start, end };
}

function getMonthRange(year: number, monthIndex: number): {
  start: Date;
  end: Date;
} {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { start, end };
}

function monthNameToIndex(name: string): number {
  const months = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro"
  ];

  return Math.max(0, months.indexOf(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
}

function resolveWeekdayDate(
  today: Date,
  weekday: string,
  direction: TemporalExpression["direction"]
): Date {
  const weekdayMap: Record<string, number> = {
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    domingo: 0
  };

  const normalizedWeekday = weekday
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const targetDay = weekdayMap[normalizedWeekday] ?? today.getUTCDay();
  const currentDay = today.getUTCDay();
  let diff = targetDay - currentDay;

  if (direction === "future") {
    diff = diff <= 0 ? diff + 7 : diff;
  } else if (direction === "past") {
    diff = diff >= 0 ? diff - 7 : diff;
  } else if (diff < 0) {
    diff += 7;
  }

  return addDays(today, diff);
}

function resolveWeekdayFromAnchor(anchor: Date, weekday: string): Date {
  const weekdayMap: Record<string, number> = {
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    domingo: 0
  };

  const normalizedWeekday = weekday
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const targetDay = weekdayMap[normalizedWeekday] ?? anchor.getUTCDay();
  const currentDay = anchor.getUTCDay();
  let diff = targetDay - currentDay;

  // A partir do anchor, vai sempre para a frente (0 = mesmo dia do anchor)
  if (diff < 0) {
    diff += 7;
  }

  return addDays(anchor, diff);
}

function dedupeTemporalHints(hints: TemporalHint[]): TemporalHint[] {
  const seen = new Set<string>();
  return hints.filter((hint) => {
    const key = JSON.stringify(hint);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function validateMessagePayload(payload: unknown): asserts payload is DiscordMessageInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload de mensagem invalido.");
  }

  const record = payload as Record<string, unknown>;
  const requiredFields = [
    "source",
    "channelId",
    "userId",
    "username",
    "messageId",
    "content",
    "timestamp"
  ] as const;

  for (const field of requiredFields) {
    if (!(field in record) || typeof record[field] !== "string") {
      throw new Error(`Campo obrigatorio em falta ou invalido: ${field}`);
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

function validateEnv(): void {
  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("ORCHESTRATOR_PORT deve ser um numero valido.");
  }

  if (!Number.isFinite(env.contextTtlMs) || env.contextTtlMs < 0) {
    throw new Error("ORCHESTRATOR_CONTEXT_TTL_MS deve ser um numero valido.");
  }

  if (!env.postgresUrl) {
    throw new Error("POSTGRES_URL e obrigatoria.");
  }

  if (!env.llmServiceUrl) {
    throw new Error("LLM_SERVICE_URL e obrigatoria.");
  }

  if (!env.normalizerServiceUrl) {
    throw new Error("NORMALIZER_SERVICE_URL e obrigatoria.");
  }

  if (!env.calendarServiceUrl) {
    throw new Error("CALENDAR_SERVICE_URL e obrigatoria.");
  }

  if (!env.extractorServiceUrl) {
    throw new Error("EXTRACTOR_SERVICE_URL e obrigatoria.");
  }

  if (!env.validatorServiceUrl) {
    throw new Error("VALIDATOR_SERVICE_URL e obrigatoria.");
  }

  if (!env.internalApiToken) {
    throw new Error("DASHBOARD_INTERNAL_API_TOKEN e obrigatoria.");
  }

  if (Number.isNaN(env.historyLimit) || env.historyLimit < 2) {
    throw new Error("ORCHESTRATOR_HISTORY_LIMIT deve ser um numero >= 2.");
  }

  if (!env.timezone) {
    throw new Error("APP_TIMEZONE e obrigatoria.");
  }
}



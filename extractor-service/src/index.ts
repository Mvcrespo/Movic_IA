import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

type AllowedCommand = {
  name: string;
  description: string;
};

type MessagePayload = {
  source: string;
  channelId: string;
  userId: string;
  username: string;
  messageId: string;
  content: string;
  timestamp: string;
};

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type PendingCommand = {
  command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
  extractedData: Record<string, unknown>;
  missingFields: string[];
  lastUserMessage: string;
  followUpQuestion: string;
  updatedAt: string;
} | null;

type ExtractionRequest = {
  plan: {
    command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
    confidence: number;
  };
  message: MessagePayload;
  history?: HistoryMessage[];
  pendingCommand?: PendingCommand;
  context: {
    app: string;
    assistantName: string;
    channelType: string;
    allowedCommands: AllowedCommand[];
    responseLanguage: string;
    outputSchemaVersion: string;
    currentDateTime: string;
    currentDate: string;
    currentTime: string;
    timezone: string;
    temporalHints?: Array<{
      expression: string;
      type: "date" | "range" | "month" | "weekday";
      date?: string;
      startDate?: string;
      endDate?: string;
      label: string;
    }>;
    normalization?: {
      originalText: string;
      correctedText: string;
      normalizedText: string;
      temporalExpressions: Array<{
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
      }>;
      notes: string[];
    };
  };
};

type FieldEvidence = {
  excerpt: string;
  reason: string;
};

type ExtractionResponse = {
  command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
  confidence: number;
  extractedData: Record<string, unknown>;
  fieldEvidence: Record<string, FieldEvidence>;
  missingFields: string[];
  notes: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

function resolveSchemaRepairAttempts(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function resolveBoolean(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "y", "on"].includes(rawValue.toLowerCase());
}

function isOllamaCloudUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "ollama.com" || hostname.endsWith(".ollama.com");
  } catch {
    return false;
  }
}

function shouldSkipModelPreflight(baseUrl: string, apiKey: string): boolean {
  return apiKey.trim().length > 0 && isOllamaCloudUrl(baseUrl);
}

const ollamaBaseUrl =
  process.env.EXTRACTOR_OLLAMA_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://ollama:11434";
const ollamaApiKey =
  process.env.EXTRACTOR_OLLAMA_API_KEY ?? process.env.OLLAMA_API_KEY ?? "";

const env = {
  port: Number(process.env.EXTRACTOR_SERVICE_PORT ?? "8004"),
  ollamaBaseUrl,
  model:
    process.env.EXTRACTOR_OLLAMA_MODEL ??
    process.env.EXTRACTOR_MODEL ??
    process.env.OLLAMA_MODEL ??
    "qwen2.5:3b",
  ollamaApiKey,
  autoPull: resolveBoolean(
    process.env.EXTRACTOR_OLLAMA_AUTO_PULL ?? process.env.EXTRACTOR_AUTO_PULL,
    !shouldSkipModelPreflight(ollamaBaseUrl, ollamaApiKey)
  ),
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "15m",
  schemaRepairAttempts: resolveSchemaRepairAttempts(
    process.env.EXTRACTOR_SCHEMA_REPAIR_ATTEMPTS ?? process.env.OLLAMA_SCHEMA_REPAIR_ATTEMPTS,
    4
  ),
  ollamaTimingLogs:
    (process.env.OLLAMA_TIMING_LOGS ?? "true").toLowerCase() === "true"
};

validateEnv();

let modelReadyPromise: Promise<void> | undefined;

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    command: {
      type: "string",
      enum: ["chat", "create_event", "list_events", "delete_event", "unknown"]
    },
    confidence: {
      type: "number"
    },
    extractedData: {
      type: "object",
      additionalProperties: true
    },
    fieldEvidence: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          excerpt: { type: "string" },
          reason: { type: "string" }
        },
        required: ["excerpt", "reason"]
      }
    },
    missingFields: {
      type: "array",
      items: {
        type: "string"
      }
    },
    notes: {
      type: "string"
    }
  },
  required: [
    "command",
    "confidence",
    "extractedData",
    "fieldEvidence",
    "missingFields",
    "notes"
  ]
};

type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const maxSchemaRepairAttempts = env.schemaRepairAttempts;

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const path = request.url ?? "/";

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        service: "extractor-service",
        model: env.model
      });
    }

    if (method === "POST" && path === "/extract") {
      const payload = (await readJsonBody(request)) as ExtractionRequest;

      validateExtractionRequest(payload);
      await ensureModelAvailable();

      const extraction = await extractWithOllama(payload);

      return sendJson(response, 200, {
        extraction
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[extractor-service] Erro:", error);

    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

server.listen(env.port, () => {
  console.log(
    `[extractor-service] A escutar na porta ${env.port} e a usar o modelo ${env.model}`
  );
});

async function extractWithOllama(
  payload: ExtractionRequest
): Promise<ExtractionResponse> {
  return requestStructuredJsonFromOllama<ExtractionResponse>({
    model: env.model,
    schema: responseSchema,
    parse: safeJsonParse,
    validate: validateExtractionResponse,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(payload)
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            message: payload.message,
            normalizedText:
              payload.context.normalization?.correctedText ?? payload.message.content,
            history: payload.history ?? [],
            pendingCommand: payload.pendingCommand ?? null,
            resolvedDates: Object.fromEntries(
              (payload.context.temporalHints ?? [])
                .filter((hint) => hint.date ?? hint.startDate)
                .map((hint) => [
                  hint.expression,
                  hint.date ?? `${hint.startDate} ate ${hint.endDate}`
                ])
            )
          },
          null,
          2
        )
      }
    ]
  });
}

async function requestStructuredJsonFromOllama<T>({
  model,
  schema,
  messages,
  parse,
  validate
}: {
  model: string;
  schema: object;
  messages: OllamaChatMessage[];
  parse: (value: string) => T | null;
  validate: (payload: unknown) => void;
}): Promise<T> {
  const startedAt = Date.now();
  const conversation = [...messages];

  for (let attempt = 1; attempt <= maxSchemaRepairAttempts; attempt += 1) {
    const response = await fetch(getOllamaUrl("/api/chat"), {
      method: "POST",
      headers: getOllamaHeaders(),
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: env.ollamaKeepAlive,
        format: schema,
        options: { num_ctx: 8192 },
        messages: conversation
      })
    });

    if (!response.ok) {
      const errorDetail = await getOllamaErrorDetail(response);
      if (env.ollamaTimingLogs) {
        console.log(
          `[extractor-service] Ollama /api/chat falhou em ${Date.now() - startedAt}ms (${response.status} ${response.statusText}${errorDetail ? ` | ${errorDetail}` : ""})`
        );
      }
      throw new Error(
        `Ollama respondeu com ${response.status} ${response.statusText}${errorDetail ? `: ${errorDetail}` : ""}`
      );
    }

    const body = (await response.json()) as {
      message?: {
        content?: string;
      };
    };

    const rawContent = body.message?.content ?? "";
    const parsed = parse(rawContent);
    let schemaIssue = "";

    if (!parsed || typeof parsed !== "object") {
      schemaIssue = "Resposta JSON invalida do Ollama";
    } else {
      try {
        validate(parsed);
      } catch (error) {
        schemaIssue = getErrorMessage(error);
      }
    }

    if (!schemaIssue) {
      if (env.ollamaTimingLogs) {
        console.log(
          `[extractor-service] Ollama /api/chat concluido em ${Date.now() - startedAt}ms (${attempt}/${maxSchemaRepairAttempts} tentativa(s))`
        );
      }
      return parsed as T;
    }

    if (attempt >= maxSchemaRepairAttempts) {
      throw new Error(`${schemaIssue}. Resposta do Ollama: ${rawContent}`);
    }

    console.warn(
      `[extractor-service] Resposta fora do schema na tentativa ${attempt}/${maxSchemaRepairAttempts}: ${schemaIssue}. A repetir pedido ao modelo.`
    );

    conversation.push({
      role: "assistant",
      content: rawContent || "(resposta vazia)"
    });
    conversation.push({
      role: "user",
      content: buildSchemaRepairPrompt(schemaIssue)
    });
  }

  throw new Error("Ollama nao devolveu JSON valido a tempo.");
}

function buildSchemaRepairPrompt(schemaIssue: string): string {
  return [
    "A tua resposta anterior nao respeitou o schema exigido.",
    `Erro detetado: ${schemaIssue}.`,
    "Corrige a resposta anterior e devolve novamente o JSON completo.",
    "Mantem os valores uteis que ja tinhas extraido e garante que todos os campos obrigatorios existem.",
    "Nao escrevas explicacoes, markdown nem texto fora do JSON."
  ].join("\n");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

function buildSystemPrompt(payload: ExtractionRequest): string {
  const resolvedDatesLines = (payload.context.temporalHints ?? [])
    .map((hint) => {
      if (hint.date) {
        return `  "${hint.expression}" = ${hint.date}`;
      }

      if (hint.startDate && hint.endDate) {
        return `  "${hint.expression}" = de ${hint.startDate} ate ${hint.endDate}`;
      }

      return null;
    })
    .filter((line): line is string => line !== null);

  return [
    "ES UM AGENTE EXTRACTOR ESPECIALIZADO EM CAMPOS DE CALENDARIO.",
    "Nao decides a resposta final ao utilizador. Apenas extrais campos e justificas com evidence.",
    "",
    "=== OBJETIVO ===",
    `Extrai dados para o comando ${payload.plan.command}.`,
    "Devolve apenas JSON valido segundo o schema.",
    "",
    "=== REGRAS PRINCIPAIS ===",
    "1. Nao inventes valores. Se nao estiver no texto ou no contexto pendente, deixa em falta.",
    "2. Para create_event, extrai: title, date, startTime, endTime, description, category.",
    "3. O campo fieldEvidence deve ter um excerto curto da frase original que suporta cada campo.",
    "4. Se a mensagem vier depois de uma pergunta de follow-up, usa pendingCommand para completar os campos em falta.",
    "5. Se a mensagem for 'saltar', 'skip', 'nada' ou equivalente e o pendingCommand estiver a pedir description, NAO ponhas description='Saltar'. Em vez disso define extractedData.__descriptionSkipped=true.",
    "6. Se o utilizador escrever um evento completo numa unica frase, tenta extrair a descricao do resto da frase apos a data/hora. Exemplo: 'Marca jantar amanha das 20:00 as 21:00 levar a prenda de anos' -> description='Levar a prenda de anos'.",
    "7. Se houver titulo implicito claro, preserva-o. 'jantar', 'almoco', 'cafe' contam como title valido.",
    "8. Usa as datas ja resolvidas quando existirem. Nunca inventes date.",
    "9. Nunca definas extractedData.__descriptionSkipped so porque a descricao nao apareceu. Esse campo so existe quando o utilizador disse explicitamente para saltar a descricao.",
    "10. Se title, date, startTime e endTime estiverem claros mas a description faltar, deixa a description em falta. Nao assumas que foi omitida pelo utilizador.",
    "11. Nunca inventes um endTime por defeito. Se o utilizador so disser 'as 10', extrai apenas startTime='10:00'. Se so disser 'termina as 14', extrai apenas endTime='14:00'.",
    "12. Se houver pendingCommand com missingFields=['description'] e a nova mensagem for texto livre como 'Levar o cao' ou 'Perguntar ao primo', trata isso como description. So NAO o facas se o utilizador disse explicitamente 'saltar', 'nao', 'nada' ou equivalente.",
    "13. Quando a category estiver clara, prefere uma categoria curta e reutilizavel destas: Reuniao, Consulta, Trabalho, Estudo, Treino, Viagem, Jantar, Lanche, Aniversario, Outros.",
    "14. Mapeia categorias raras para categorias mais uteis: 'pequeno-almoco', 'almoco', 'brunch' e 'cafe' devem cair em 'Lanche'; 'conferencia', 'workshop', 'seminario' e 'palestra' devem cair em 'Reuniao'.",
    "15. So sugiras uma category nova fora dessa lista se nao houver mesmo encaixe razoavel numa categoria existente.",
    "",
    "=== DATAS RESOLVIDAS ===",
    resolvedDatesLines.length > 0
      ? resolvedDatesLines.join("\n")
      : "  (nenhuma data resolvida)",
    "",
    "=== CAMPOS EM FALTA DO TURNO ANTERIOR ===",
    payload.pendingCommand?.missingFields.join(", ") || "nenhum",
    "",
    "=== SCHEMA DE RESPOSTA ===",
    JSON.stringify(responseSchema)
  ].join("\n");
}

async function ensureModelAvailable(): Promise<void> {
  if (shouldSkipModelPreflight(env.ollamaBaseUrl, env.ollamaApiKey)) {
    return;
  }

  if (!env.autoPull) {
    await waitForOllamaReady();
    return;
  }

  if (!modelReadyPromise) {
    modelReadyPromise = ensureModelAvailableOnce().catch((error) => {
      modelReadyPromise = undefined;
      throw error;
    });
  }

  await modelReadyPromise;
}

async function ensureModelAvailableOnce(): Promise<void> {
  await waitForOllamaReady();

  const tagsResponse = await fetch(getOllamaUrl("/api/tags"), {
    headers: getOllamaHeaders()
  });
  if (!tagsResponse.ok) {
    const errorDetail = await getOllamaErrorDetail(tagsResponse);
    throw new Error(
      `Nao foi possivel listar modelos no Ollama: ${tagsResponse.status} ${tagsResponse.statusText}${errorDetail ? `: ${errorDetail}` : ""}`
    );
  }

  const tagsBody = (await tagsResponse.json()) as OllamaTagsResponse;
  const models = tagsBody.models ?? [];
  const modelAlreadyAvailable = models.some((model) => {
    const name = model.name ?? "";
    return name === env.model || name.startsWith(`${env.model}:`);
  });

  if (modelAlreadyAvailable) {
    return;
  }

  const pullResponse = await fetch(getOllamaUrl("/api/pull"), {
    method: "POST",
    headers: getOllamaHeaders(),
    body: JSON.stringify({
      model: env.model,
      stream: false
    })
  });

  if (!pullResponse.ok) {
    const errorDetail = await getOllamaErrorDetail(pullResponse);
    throw new Error(
      `Falhou o pull do modelo ${env.model}: ${pullResponse.status} ${pullResponse.statusText}${errorDetail ? `: ${errorDetail}` : ""}`
    );
  }
}

async function waitForOllamaReady(): Promise<void> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(getOllamaUrl("/api/tags"), {
        headers: getOllamaHeaders()
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry while Ollama starts.
    }

    console.log(
      `[extractor-service] A aguardar que o Ollama fique pronto (${attempt}/${maxAttempts})...`
    );
    await sleep(2000);
  }

  throw new Error("O Ollama nao ficou pronto a tempo.");
}

function getOllamaUrl(path: string): string {
  return `${env.ollamaBaseUrl.replace(/\/$/, "")}${path}`;
}

function getOllamaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const apiKey = env.ollamaApiKey.trim();

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function getOllamaErrorDetail(response: Response): Promise<string> {
  try {
    const raw = (await response.text()).trim();

    if (!raw) {
      return "";
    }

    const parsed = safeJsonParse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof parsed.error === "string"
    ) {
      return parsed.error;
    }

    return raw;
  } catch {
    return "";
  }
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

function validateExtractionRequest(
  payload: unknown
): asserts payload is ExtractionRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;

  if (!record.message || typeof record.message !== "object") {
    throw new Error("Campo 'message' em falta.");
  }

  if (!record.plan || typeof record.plan !== "object") {
    throw new Error("Campo 'plan' em falta.");
  }
}

function validateExtractionResponse(
  payload: unknown
): asserts payload is ExtractionResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Extracao invalida.");
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.command !== "string") {
    throw new Error("Campo invalido na extracao: command");
  }

  if (typeof record.confidence !== "number") {
    throw new Error("Campo invalido na extracao: confidence");
  }

  if (!record.extractedData || typeof record.extractedData !== "object") {
    throw new Error("Campo invalido na extracao: extractedData");
  }

  if (!record.fieldEvidence || typeof record.fieldEvidence !== "object") {
    throw new Error("Campo invalido na extracao: fieldEvidence");
  }

  if (
    !Array.isArray(record.missingFields) ||
    record.missingFields.some((field) => typeof field !== "string")
  ) {
    throw new Error("Campo invalido na extracao: missingFields");
  }

  if (typeof record.notes !== "string") {
    throw new Error("Campo invalido na extracao: notes");
  }
}

function safeJsonParse(value: string): ExtractionResponse | null {
  for (const candidate of getJsonCandidates(value)) {
    for (const parseCandidate of buildJsonRepairCandidates(candidate)) {
      try {
        return normalizeExtractionResponseShape(
          JSON.parse(parseCandidate) as Record<string, unknown>
        );
      } catch {
        continue;
      }
    }
  }

  return null;
}

function buildJsonRepairCandidates(value: string): string[] {
  const candidates = new Set<string>([value]);
  const balanced = appendMissingJsonClosers(value);
  if (balanced !== value) {
    candidates.add(balanced);
  }
  return [...candidates];
}

function appendMissingJsonClosers(value: string): string {
  let curlyBalance = 0;
  let squareBalance = 0;
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      curlyBalance += 1;
    } else if (char === "}") {
      curlyBalance = Math.max(0, curlyBalance - 1);
    } else if (char === "[") {
      squareBalance += 1;
    } else if (char === "]") {
      squareBalance = Math.max(0, squareBalance - 1);
    }
  }

  if (curlyBalance === 0 && squareBalance === 0) {
    return value;
  }

  return `${value}${"]".repeat(squareBalance)}${"}".repeat(curlyBalance)}`;
}

function normalizeExtractionResponseShape(
  parsed: Record<string, unknown>
): ExtractionResponse {
  const record = { ...parsed };
  const fieldEvidence =
    record.fieldEvidence && typeof record.fieldEvidence === "object"
      ? { ...(record.fieldEvidence as Record<string, unknown>) }
      : null;

  if (fieldEvidence) {
    if (
      !Array.isArray(record.missingFields) &&
      Array.isArray(fieldEvidence.missingFields) &&
      fieldEvidence.missingFields.every((field) => typeof field === "string")
    ) {
      record.missingFields = fieldEvidence.missingFields;
      delete fieldEvidence.missingFields;
    }

    if (typeof record.notes !== "string" && typeof fieldEvidence.notes === "string") {
      record.notes = fieldEvidence.notes;
      delete fieldEvidence.notes;
    }

    record.fieldEvidence = fieldEvidence;
  }

  return record as ExtractionResponse;
}

function getJsonCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>([trimmed]);
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(trimmed.slice(firstBrace, lastBrace + 1).trim());
  }

  return [...candidates];
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function validateEnv(): void {
  if (Number.isNaN(env.port) || env.port < 1 || env.port > 65535) {
    throw new Error("EXTRACTOR_SERVICE_PORT deve ser um numero valido.");
  }

  if (!env.ollamaBaseUrl) {
    throw new Error("OLLAMA_BASE_URL e obrigatoria.");
  }

  if (isOllamaCloudUrl(env.ollamaBaseUrl) && !env.ollamaApiKey.trim()) {
    throw new Error("OLLAMA_API_KEY e obrigatoria quando OLLAMA_BASE_URL aponta para Ollama Cloud.");
  }

  if (!env.model) {
    throw new Error("EXTRACTOR_MODEL e obrigatoria.");
  }
}

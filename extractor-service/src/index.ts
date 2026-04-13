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

const env = {
  port: Number(process.env.EXTRACTOR_SERVICE_PORT ?? "8004"),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
  model: process.env.EXTRACTOR_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
  autoPull: (process.env.EXTRACTOR_AUTO_PULL ?? "true").toLowerCase() === "true",
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "15m",
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
  const startedAt = Date.now();
  const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.model,
      stream: false,
      keep_alive: env.ollamaKeepAlive,
      format: responseSchema,
      options: { num_ctx: 8192 },
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
    })
  });

  if (!response.ok) {
    if (env.ollamaTimingLogs) {
      console.log(
        `[extractor-service] Ollama /api/chat falhou em ${Date.now() - startedAt}ms (${response.status} ${response.statusText})`
      );
    }
    throw new Error(
      `Ollama respondeu com ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    message?: {
      content?: string;
    };
  };

  const rawContent = body.message?.content ?? "";
  const parsed = safeJsonParse(rawContent);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Resposta JSON invalida do Ollama: ${rawContent}`);
  }

  validateExtractionResponse(parsed);

  if (env.ollamaTimingLogs) {
    console.log(
      `[extractor-service] Ollama /api/chat concluido em ${Date.now() - startedAt}ms`
    );
  }

  return parsed;
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

  const tagsResponse = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`);
  if (!tagsResponse.ok) {
    throw new Error(
      `Nao foi possivel listar modelos no Ollama: ${tagsResponse.status} ${tagsResponse.statusText}`
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

  const pullResponse = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/pull`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.model,
      stream: false
    })
  });

  if (!pullResponse.ok) {
    throw new Error(
      `Falhou o pull do modelo ${env.model}: ${pullResponse.status} ${pullResponse.statusText}`
    );
  }
}

async function waitForOllamaReady(): Promise<void> {
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`);
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
  try {
    return JSON.parse(value) as ExtractionResponse;
  } catch {
    return null;
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

  if (!env.model) {
    throw new Error("EXTRACTOR_MODEL e obrigatoria.");
  }
}

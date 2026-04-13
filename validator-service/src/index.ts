import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

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

type FieldEvidence = {
  excerpt: string;
  reason: string;
};

type ValidationRequest = {
  plan: {
    command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
    confidence: number;
  };
  extraction: {
    command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
    confidence: number;
    extractedData: Record<string, unknown>;
    fieldEvidence: Record<string, FieldEvidence>;
    missingFields: string[];
    notes: string;
  };
  message: MessagePayload;
  history?: HistoryMessage[];
  pendingCommand?: PendingCommand;
  context: {
    currentDate: string;
    currentTime: string;
    timezone: string;
    normalization?: {
      originalText: string;
      correctedText: string;
      normalizedText: string;
      temporalExpressions: Array<{
        text: string;
        kind: string;
      }>;
      notes: string[];
    };
  };
};

type ValidationResponse = {
  command: "chat" | "create_event" | "list_events" | "delete_event" | "unknown";
  approved: boolean;
  confidence: number;
  extractedData: Record<string, unknown>;
  fieldEvidence: Record<string, FieldEvidence>;
  missingFields: string[];
  shouldAskFollowUp: boolean;
  followUpQuestion: string;
  notes: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

const env = {
  port: Number(process.env.VALIDATOR_SERVICE_PORT ?? "8005"),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
  model: process.env.VALIDATOR_MODEL ?? process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
  autoPull: (process.env.VALIDATOR_AUTO_PULL ?? "true").toLowerCase() === "true",
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
    approved: {
      type: "boolean"
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
    shouldAskFollowUp: {
      type: "boolean"
    },
    followUpQuestion: {
      type: "string"
    },
    notes: {
      type: "string"
    }
  },
  required: [
    "command",
    "approved",
    "confidence",
    "extractedData",
    "fieldEvidence",
    "missingFields",
    "shouldAskFollowUp",
    "followUpQuestion",
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
        service: "validator-service",
        model: env.model
      });
    }

    if (method === "POST" && path === "/validate") {
      const payload = (await readJsonBody(request)) as ValidationRequest;

      validateValidationRequest(payload);
      await ensureModelAvailable();

      const validation = await validateWithOllama(payload);

      return sendJson(response, 200, {
        validation
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[validator-service] Erro:", error);

    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

server.listen(env.port, () => {
  console.log(
    `[validator-service] A escutar na porta ${env.port} e a usar o modelo ${env.model}`
  );
});

async function validateWithOllama(
  payload: ValidationRequest
): Promise<ValidationResponse> {
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
          content: JSON.stringify(payload, null, 2)
        }
      ]
    })
  });

  if (!response.ok) {
    if (env.ollamaTimingLogs) {
      console.log(
        `[validator-service] Ollama /api/chat falhou em ${Date.now() - startedAt}ms (${response.status} ${response.statusText})`
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

  validateValidationResponse(parsed);

  if (env.ollamaTimingLogs) {
    console.log(
      `[validator-service] Ollama /api/chat concluido em ${Date.now() - startedAt}ms`
    );
  }

  return parsed;
}

function buildSystemPrompt(payload: ValidationRequest): string {
  return [
    "ES UM AGENTE VALIDATOR DE CALENDARIO.",
    "Nao inventas campos novos sem base textual. O teu trabalho e confirmar, corrigir e pedir esclarecimento quando necessario.",
    "",
    "=== REGRAS ===",
    "1. Se extraction.extractedData contiver description='Saltar' ou equivalente, transforma isso em extractedData.__descriptionSkipped=true e remove description.",
    "2. Se a mensagem contem um resto de frase claramente descritivo depois do titulo e da janela horaria, isso deve ir para description.",
    "3. Se a mensagem responde a uma pergunta anterior de description e diz apenas 'saltar', approve=true, shouldAskFollowUp=false e extractedData.__descriptionSkipped=true.",
    "4. Se houver contradicao forte entre campos e evidence, rejeita ou pede follow-up.",
    "5. Se faltar informacao obrigatoria para create_event, identifica missingFields e escreve followUpQuestion curta.",
    "6. Mantem command consistente com o plano principal, salvo se houver evidencia clara em contrario.",
    "7. Nunca marques __descriptionSkipped se o utilizador nao disse explicitamente que queria saltar a descricao.",
    "8. 'Descricao em falta' NAO significa 'descricao omitida pelo utilizador'. Se a description nao estiver no texto, deixa-a em falta para follow-up.",
    "9. Nunca aproves um endTime inventado por duracao padrao. Se o texto so tiver hora de inicio, endTime deve continuar em falta.",
    "10. Se o pendingCommand estiver a pedir description, quase qualquer resposta textual nao temporal deve ser aceite como description. Exemplo: 'Levar o cao' ou 'Perguntar ao primo'.",
    "11. Quando validares a category, prefere categorias curtas e reutilizaveis: Reuniao, Consulta, Trabalho, Estudo, Treino, Viagem, Jantar, Lanche, Aniversario, Outros.",
    "12. Se vierem categorias demasiado especificas como 'pequeno-almoco', 'brunch', 'conferencia' ou 'workshop', normaliza para uma categoria mais ampla quando houver encaixe claro.",
    "13. So aproves uma category nova fora dessa lista quando nao houver mesmo uma categoria existente que faca sentido.",
    "",
    "=== CONTEXTO ===",
    `Plan command: ${payload.plan.command}`,
    `Plan confidence: ${payload.plan.confidence}`,
    `Timezone: ${payload.context.timezone}`,
    `Data atual: ${payload.context.currentDate} ${payload.context.currentTime}`,
    `Pending fields: ${payload.pendingCommand?.missingFields.join(", ") || "nenhum"}`,
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
      `[validator-service] A aguardar que o Ollama fique pronto (${attempt}/${maxAttempts})...`
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

function validateValidationRequest(
  payload: unknown
): asserts payload is ValidationRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;

  if (!record.plan || typeof record.plan !== "object") {
    throw new Error("Campo 'plan' em falta.");
  }

  if (!record.extraction || typeof record.extraction !== "object") {
    throw new Error("Campo 'extraction' em falta.");
  }
}

function validateValidationResponse(
  payload: unknown
): asserts payload is ValidationResponse {
  if (!payload || typeof payload !== "object") {
    throw new Error("Validacao invalida.");
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.command !== "string") {
    throw new Error("Campo invalido na validacao: command");
  }

  if (typeof record.approved !== "boolean") {
    throw new Error("Campo invalido na validacao: approved");
  }

  if (typeof record.confidence !== "number") {
    throw new Error("Campo invalido na validacao: confidence");
  }

  if (!record.extractedData || typeof record.extractedData !== "object") {
    throw new Error("Campo invalido na validacao: extractedData");
  }

  if (!record.fieldEvidence || typeof record.fieldEvidence !== "object") {
    throw new Error("Campo invalido na validacao: fieldEvidence");
  }

  if (
    !Array.isArray(record.missingFields) ||
    record.missingFields.some((field) => typeof field !== "string")
  ) {
    throw new Error("Campo invalido na validacao: missingFields");
  }

  if (typeof record.shouldAskFollowUp !== "boolean") {
    throw new Error("Campo invalido na validacao: shouldAskFollowUp");
  }

  if (typeof record.followUpQuestion !== "string") {
    throw new Error("Campo invalido na validacao: followUpQuestion");
  }

  if (typeof record.notes !== "string") {
    throw new Error("Campo invalido na validacao: notes");
  }
}

function safeJsonParse(value: string): ValidationResponse | null {
  try {
    return JSON.parse(value) as ValidationResponse;
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
    throw new Error("VALIDATOR_SERVICE_PORT deve ser um numero valido.");
  }

  if (!env.ollamaBaseUrl) {
    throw new Error("OLLAMA_BASE_URL e obrigatoria.");
  }

  if (!env.model) {
    throw new Error("VALIDATOR_MODEL e obrigatoria.");
  }
}

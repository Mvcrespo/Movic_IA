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

type InterpretRequest = {
  message: {
    source: string;
    channelId: string;
    userId: string;
    username: string;
    messageId: string;
    content: string;
    timestamp: string;
  };
  history?: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  pendingCommand?: {
    command:
      | "chat"
      | "create_event"
      | "list_events"
      | "delete_event"
      | "update_event"
      | "unknown";
    extractedData: Record<string, unknown>;
    missingFields: string[];
    lastUserMessage: string;
    followUpQuestion: string;
    updatedAt: string;
  } | null;
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

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
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
  needsCalendarAction: boolean;
  shouldAskFollowUp: boolean;
  missingFields: string[];
  followUpQuestion: string;
  notes: string;
};

function resolveSchemaRepairAttempts(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

const env = {
  port: Number(process.env.LLM_SERVICE_PORT ?? "8001"),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
  ollamaAutoPull: (process.env.OLLAMA_AUTO_PULL ?? "true").toLowerCase() === "true",
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "15m",
  schemaRepairAttempts: resolveSchemaRepairAttempts(
    process.env.LLM_SCHEMA_REPAIR_ATTEMPTS ?? process.env.OLLAMA_SCHEMA_REPAIR_ATTEMPTS,
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
      enum: ["chat", "create_event", "list_events", "delete_event", "update_event", "unknown"]
    },
    hasCommand: {
      type: "boolean"
    },
    confidence: {
      type: "number"
    },
    isComplete: {
      type: "boolean"
    },
    reply: {
      type: "string"
    },
    extractedData: {
      type: "object",
      additionalProperties: true
    },
    needsCalendarAction: {
      type: "boolean"
    },
    shouldAskFollowUp: {
      type: "boolean"
    },
    missingFields: {
      type: "array",
      items: {
        type: "string"
      }
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
    "hasCommand",
    "confidence",
    "isComplete",
    "reply",
    "extractedData",
    "needsCalendarAction",
    "shouldAskFollowUp",
    "missingFields",
    "followUpQuestion",
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
        service: "llm-service",
        model: env.ollamaModel,
        ollamaBaseUrl: env.ollamaBaseUrl
      });
    }

    if (method === "POST" && path === "/interpret") {
      const payload = (await readJsonBody(request)) as InterpretRequest;

      validateInterpretRequest(payload);
      await ensureModelAvailable();

      const interpretation = await interpretWithOllama(payload);

      return sendJson(response, 200, {
        interpretation
      });
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[llm-service] Erro:", error);

    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

server.listen(env.port, () => {
  console.log(
    `[llm-service] A escutar na porta ${env.port} e a usar o modelo ${env.ollamaModel}`
  );
});

async function interpretWithOllama(
  payload: InterpretRequest
): Promise<LlmInterpretation> {
  return requestStructuredJsonFromOllama<LlmInterpretation>({
    model: env.ollamaModel,
    schema: responseSchema,
    parse: safeJsonParse,
    validate: validateInterpretation,
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
            resolvedDates: Object.fromEntries(
              (payload.context.temporalHints ?? [])
                .filter((h) => h.date ?? h.startDate)
                .map((h) => [
                  h.expression,
                  h.date ?? `${h.startDate} ate ${h.endDate}`
                ])
            ),
            history: payload.history ?? [],
            pendingCommand: payload.pendingCommand ?? null
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
    const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
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
          `[llm-service] Ollama /api/chat falhou em ${Date.now() - startedAt}ms (${response.status} ${response.statusText}${errorDetail ? ` | ${errorDetail}` : ""})`
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
          `[llm-service] Ollama /api/chat concluido em ${Date.now() - startedAt}ms (${attempt}/${maxSchemaRepairAttempts} tentativa(s))`
        );
      }
      return parsed as T;
    }

    if (attempt >= maxSchemaRepairAttempts) {
      throw new Error(`${schemaIssue}. Resposta do Ollama: ${rawContent}`);
    }

    console.warn(
      `[llm-service] Resposta fora do schema na tentativa ${attempt}/${maxSchemaRepairAttempts}: ${schemaIssue}. A repetir pedido ao modelo.`
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

function buildSystemPrompt(payload: InterpretRequest): string {
  const hints = payload.context.temporalHints ?? [];
  const resolvedDatesLines = hints
    .map((h) => {
      if (h.type === "date" && h.date) {
        return `  "${h.expression}" = ${h.date}`;
      }
      if ((h.type === "range" || h.type === "month") && h.startDate && h.endDate) {
        return `  "${h.expression}" = de ${h.startDate} ate ${h.endDate}`;
      }
      if (h.type === "weekday" && h.date) {
        return `  "${h.expression}" = ${h.date}`;
      }
      return null;
    })
    .filter((line): line is string => line !== null);

  const norm = payload.context.normalization;
  const pending = payload.pendingCommand;

  const lines: string[] = [
    `ES O PULSE, assistente de agenda pessoal. Respondes SEMPRE na lingua em que o utilizador te escreveu. Se for portugues, usa OBRIGATORIAMENTE o Portugues de Portugal (PT-PT) â€” nunca o Brasileiro (sem "voce", sem "vc", sem "obrigado" com "o" no fim, sem "vocÃª", usa sempre "tu"/"obrigado"). Se for ingles, responde em ingles. Adaptas automaticamente a lingua a cada mensagem.`,
    `Se responderes em portugues, escreve SEMPRE com acentos corretos em PT-PT nas frases para o utilizador. Exemplos: "amanha" -> "amanhã", "descricao" -> "descrição", "periodo" -> "período", "proximo mes" -> "próximo mês", "nao" -> "não".`,
    ``,
    `=== DATA E HORA ATUAL ===`,
    `Data: ${payload.context.currentDate} | Hora: ${payload.context.currentTime} | Timezone: ${payload.context.timezone}`,
    ``,
    `=== DATAS JA RESOLVIDAS (usa estas para preencher date) ===`,
    resolvedDatesLines.length > 0
      ? resolvedDatesLines.join("\n")
      : `  (nenhuma expressao temporal encontrada - nao inventes datas)`,
    ``,
    `=== TEXTO DO UTILIZADOR (apos correcao ortografica) ===`,
    `Original : "${norm?.originalText ?? payload.message.content}"`,
    `Corrigido: "${norm?.correctedText ?? payload.message.content}"`,
    ``,
    `=== TAREFA ===`,
    `Interpreta a mensagem e devolve JSON. Decide se e conversa normal (chat) ou comando de calendario.`,
    `Comandos suportados: create_event | list_events | delete_event | update_event | chat`,
    ``,
    `=== CAMPOS PARA create_event ===`,
    `title       (obrigatorio) : nome do evento. Preserva siglas e nomes. Ex: "reuniao da EF" â†’ title="Reuniao da EF"`,
    `date        (obrigatorio) : data em YYYY-MM-DD. Usa as DATAS JA RESOLVIDAS acima. Nunca inventas.`,
    `startTime   (obrigatorio) : hora de inicio em HH:MM. Nunca inventas.`,
    `endTime     (obrigatorio) : hora de fim em HH:MM. Nunca inventas.`,
    `description (opcional)   : assunto do evento. "sobre a bolsa" â†’ description="Sobre a bolsa". Nao incluis referencias temporais na description.`,
    `category    (opcional)   : infere do contexto. "reuniao"â†’"meeting" | "estudo"â†’"study" | "tarefa"â†’"task" | "pessoal"â†’"personal"`,
    ``,
    `=== CAMPOS PARA delete_event ===`,
    `title       (opcional mas recomendado) : nome ou tipo do evento a apagar. Ex: "apaga a reuniao de sexta" â†’ title="Reuniao"`,
    `date        (opcional mas recomendado) : data do evento a apagar em YYYY-MM-DD quando estiver clara no texto ou nas datas resolvidas.`,
    `rawDate     (opcional) : expressao temporal curta original, como "sexta" ou "amanha".`,
    `Nao inventas pageIds nem assumes qual dos eventos e o certo quando houver ambiguidade.`,
    ``,
    `=== CAMPOS PARA update_event ===`,
    `title       (opcional mas recomendado) : nome ou tipo do evento a alterar. Ex: "altera o almoco de amanha" -> title="Almoco"`,
    `date/rawDate (opcional mas recomendado) : data atual do evento que o utilizador quer alterar.`,
    `startTime   (opcional) : hora atual do evento quando serve para desambiguar. Ex: "o das 10".`,
    `newDate     (opcional) : nova data em YYYY-MM-DD se o utilizador disser "para dia 30", "para sexta", etc.`,
    `newStartTime/newEndTime (opcional) : novas horas apenas se o utilizador as disser explicitamente.`,
    `Se o utilizador disser "mesma hora" ou "mesmas horas", isso significa manter as horas atuais do evento.`,
    ``,
    `=== REGRAS DE EXTRACAO ===`,
    `1. TITLE e DESCRIPTION: "reuniao da EF sobre a bolsa" â†’ title="Reuniao da EF", description="a bolsa". O "sobre ..." e a descricao, nunca o titulo.`,
    `1b. Se o utilizador disser explicitamente "jantar", "almoco", "cafe" ou "pequeno-almoco", preserva esse tipo de evento no title. Nunca troques "jantar" por "almoco".`,
    `2. DATE: O campo "resolvedDates" no input JSON tem as datas ja calculadas. Se "amanha"="2026-03-23", usa date="2026-03-23" diretamente. Nunca colocas "date" em missingFields se estiver em resolvedDates.`,
    `3. STARTTIME e ENDTIME: So extrais se o utilizador der horas explicitamente. Se der "as 11:30" sem fim, startTime="11:30" e endTime=null. Se der "das 10:00 as 11:00", startTime="10:00" e endTime="11:00". Nunca inventas horas.`,
    `4. Se "para a semana" ou "esta semana" sem dia especifico â†’ date=null, pede o dia da semana.`,
    `5. Se o utilizador ja disse "para a semana" (pendingCommand) e agora diz "quarta", combina e usa a quarta dessa semana.`,
    `6. AMBIGUIDADE DE DATA NA DESCRICAO: Se "para [dia]" aparece depois de "sobre [conteudo]" e nao e claro se e a data do evento ou parte do assunto, NAO ASSUMES â€” pede esclarecimento. Exemplo: "reuniao com Ana sobre a bolsa para segunda" pode ser "reuniao na segunda sobre a bolsa" OU "vao falar sobre a bolsa para segunda-feira". Neste caso pergunta: "A reuniao e para segunda-feira, ou iam discutir a bolsa na segunda?" Use command="create_event", hasCommand=true, isComplete=false, shouldAskFollowUp=true.`,
    `7. Para delete_event e update_event, extrai o maximo de pistas de identificacao (title/date/rawDate/startTime), mas nunca assumes qual evento e o certo se puder haver mais do que um.`,
    ``,
    `=== REGRAS DE COMPLETUDE ===`,
    `isComplete=true APENAS quando title + date + startTime + endTime estao todos preenchidos.`,
    `needsCalendarAction=true APENAS quando isComplete=true.`,
    `Para update_event, isComplete=true apenas quando o evento a alterar estiver suficientemente identificado e a alteracao estiver completa.`,
    `Se faltar date e horas: followUpQuestion="Para que dia e a que horas e a reuniao?"`,
    `Se faltar so date: followUpQuestion="Para que dia queres marcar?"`,
    `Se faltar so horas: followUpQuestion="A que horas comeca e a que horas termina?"`,
    `Se so faltar endTime: followUpQuestion="E ate que horas vai durar?"`,
    `Se so faltar description (tudo o resto completo): followUpQuestion="Tens alguma nota a acrescentar? (podes 'saltar' se quiseres)"`,
    ``,
    `=== REGRAS DE CHAT ===`,
    `Saudacoes (ola, boas, como estas, hello, test...): command="chat", reply natural convidando a usar a agenda.`,
    `Ambiguo ou confianca < 0.9: command="unknown", shouldAskFollowUp=true.`,
    `Nunca assumes comando de calendario se nao estiveres muito certo (confidence >= 0.9).`,
    ``
  ];

  if (pending) {
    lines.push(`=== CONTEXTO DE TURNO ANTERIOR ===`);
    lines.push(`Comando anterior: ${pending.command}`);
    lines.push(`Dados ja recolhidos: ${JSON.stringify(pending.extractedData)}`);
    lines.push(`Campos em falta: ${pending.missingFields.join(", ") || "nenhum"}`);
    lines.push(`Ultima pergunta feita: "${pending.followUpQuestion}"`);
    lines.push(`Combina a nova mensagem com os dados ja recolhidos. Nao perguntes de novo o que ja foi respondido.`);
    lines.push(``);
  }

  lines.push(`=== SCHEMA DE RESPOSTA ===`);
  lines.push(JSON.stringify(responseSchema));

  return lines.join("\n");
}

async function ensureModelAvailable(): Promise<void> {
  if (!env.ollamaAutoPull) {
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
    const errorDetail = await getOllamaErrorDetail(tagsResponse);
    throw new Error(
      `Nao foi possivel listar modelos no Ollama: ${tagsResponse.status} ${tagsResponse.statusText}${errorDetail ? `: ${errorDetail}` : ""}`
    );
  }

  const tagsBody = (await tagsResponse.json()) as OllamaTagsResponse;
  const models = tagsBody.models ?? [];
  const modelAlreadyAvailable = models.some((model) => {
    const name = model.name ?? "";
    return name === env.ollamaModel || name.startsWith(`${env.ollamaModel}:`);
  });

  if (modelAlreadyAvailable) {
    return;
  }

  console.log(`[llm-service] Modelo ${env.ollamaModel} nao encontrado. A fazer pull...`);

  const pullResponse = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/pull`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.ollamaModel,
      stream: false
    })
  });

  if (!pullResponse.ok) {
    const errorDetail = await getOllamaErrorDetail(pullResponse);
    throw new Error(
      `Falhou o pull do modelo ${env.ollamaModel}: ${pullResponse.status} ${pullResponse.statusText}${errorDetail ? `: ${errorDetail}` : ""}`
    );
  }

  console.log(`[llm-service] Pull do modelo ${env.ollamaModel} concluido.`);
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
      // Keep retrying while Ollama starts.
    }

    console.log(
      `[llm-service] A aguardar que o Ollama fique pronto (${attempt}/${maxAttempts})...`
    );
    await sleep(2000);
  }

  throw new Error("O Ollama nao ficou pronto a tempo.");
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

function validateInterpretRequest(payload: unknown): asserts payload is InterpretRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  if (!("message" in payload) || !payload.message || typeof payload.message !== "object") {
    throw new Error("Campo 'message' em falta.");
  }

  if (!("content" in payload.message) || typeof payload.message.content !== "string") {
    throw new Error("Campo 'message.content' em falta.");
  }

  if (!("context" in payload) || !payload.context || typeof payload.context !== "object") {
    throw new Error("Campo 'context' em falta.");
  }

  if (
    !("assistantName" in payload.context) ||
    typeof payload.context.assistantName !== "string"
  ) {
    throw new Error("Campo 'context.assistantName' em falta.");
  }

  const contextRecord = payload.context as Record<string, unknown>;

  const requiredContextFields = [
    "currentDateTime",
    "currentDate",
    "currentTime",
    "timezone"
  ] as const;

  for (const field of requiredContextFields) {
    if (!(field in contextRecord) || typeof contextRecord[field] !== "string") {
      throw new Error(`Campo 'context.${field}' em falta.`);
    }
  }
}

function validateInterpretation(
  payload: unknown
): asserts payload is LlmInterpretation {
  if (!payload || typeof payload !== "object") {
    throw new Error("Interpretacao LLM invalida.");
  }

  const record = payload as Record<string, unknown>;

  const requiredStringFields = ["command", "reply", "followUpQuestion", "notes"] as const;

  for (const field of requiredStringFields) {
    if (!(field in record) || typeof record[field] !== "string") {
      throw new Error(`Campo invalido na interpretacao: ${field}`);
    }
  }

  if (!("hasCommand" in record) || typeof record.hasCommand !== "boolean") {
    throw new Error("Campo invalido na interpretacao: hasCommand");
  }

  if (!("isComplete" in record) || typeof record.isComplete !== "boolean") {
    throw new Error("Campo invalido na interpretacao: isComplete");
  }

  if (!("confidence" in record) || typeof record.confidence !== "number") {
    throw new Error("Campo invalido na interpretacao: confidence");
  }

  if (
    !("needsCalendarAction" in record) ||
    typeof record.needsCalendarAction !== "boolean"
  ) {
    throw new Error("Campo invalido na interpretacao: needsCalendarAction");
  }

  if (
    !("shouldAskFollowUp" in record) ||
    typeof record.shouldAskFollowUp !== "boolean"
  ) {
    throw new Error("Campo invalido na interpretacao: shouldAskFollowUp");
  }

  if (
    !("extractedData" in record) ||
    !record.extractedData ||
    typeof record.extractedData !== "object"
  ) {
    throw new Error("Campo invalido na interpretacao: extractedData");
  }

  if (
    !("missingFields" in record) ||
    !Array.isArray(record.missingFields) ||
    record.missingFields.some((field) => typeof field !== "string")
  ) {
    throw new Error("Campo invalido na interpretacao: missingFields");
  }
}

function safeJsonParse(value: string): LlmInterpretation | null {
  for (const candidate of getJsonCandidates(value)) {
    try {
      return JSON.parse(candidate) as LlmInterpretation;
    } catch {
      continue;
    }
  }

  return null;
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
    throw new Error("LLM_SERVICE_PORT deve ser um numero valido.");
  }

  if (!env.ollamaBaseUrl) {
    throw new Error("OLLAMA_BASE_URL e obrigatoria.");
  }

  if (!env.ollamaModel) {
    throw new Error("OLLAMA_MODEL e obrigatoria.");
  }
}


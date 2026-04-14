import "dotenv/config";

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";

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

type NormalizeRequest = {
  text: string;
  context: {
    currentDateTime: string;
    currentDate: string;
    currentTime: string;
    timezone: string;
  };
};

type NormalizeResponse = {
  originalText: string;
  correctedText: string;
  normalizedText: string;
  temporalExpressions: TemporalExpression[];
  notes: string[];
};

type ModelNormalization = {
  correctedText: string;
  temporalExpressions: TemporalExpression[];
  notes: string[];
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

const env = {
  port: Number(process.env.NORMALIZER_SERVICE_PORT ?? "8002"),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://ollama:11434",
  model: process.env.NORMALIZER_MODEL ?? "qwen2.5:3b",
  autoPull: (process.env.NORMALIZER_AUTO_PULL ?? "true").toLowerCase() === "true",
  ollamaKeepAlive: process.env.OLLAMA_KEEP_ALIVE ?? "15m",
  ollamaTimingLogs:
    (process.env.OLLAMA_TIMING_LOGS ?? "true").toLowerCase() === "true"
};

validateEnv();

let modelReadyPromise: Promise<void> | undefined;

const modelResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    correctedText: {
      type: "string"
    },
    temporalExpressions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "relative_day",
              "relative_range",
              "relative_offset",
              "weekday",
              "month",
              "year",
              "part_of_day"
            ]
          },
          direction: {
            type: "string",
            enum: ["past", "current", "future"]
          },
          unit: {
            type: "string",
            enum: ["day", "week", "month", "year"]
          },
          amount: { type: "number" },
          weekday: { type: "string" },
          month: { type: "string" },
          partOfDay: {
            type: "string",
            enum: ["morning", "afternoon", "evening", "night"]
          }
        },
        required: ["text", "kind"]
      }
    },
    notes: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["correctedText", "temporalExpressions", "notes"]
};

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const path = request.url ?? "/";

    if (method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        service: "normalizer-service",
        model: env.model
      });
    }

    if (method === "POST" && path === "/normalize") {
      const payload = (await readJsonBody(request)) as NormalizeRequest;
      validateNormalizeRequest(payload);

      return sendJson(response, 200, await normalizeInput(payload));
    }

    return sendJson(response, 404, {
      error: "Not Found"
    });
  } catch (error) {
    console.error("[normalizer-service] Erro:", error);

    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Erro interno"
    });
  }
});

server.listen(env.port, () => {
  console.log(
    `[normalizer-service] A escutar na porta ${env.port} e a usar o modelo ${env.model}`
  );
});

async function normalizeInput(payload: NormalizeRequest): Promise<NormalizeResponse> {
  const heuristicText = applyHeuristicCorrections(payload.text);
  const modelNormalization = await getModelNormalization(heuristicText, payload.context);
  const correctedText = modelNormalization.correctedText.trim() || heuristicText;

  return {
    originalText: payload.text,
    correctedText,
    normalizedText: normalizeWhitespace(correctedText),
    temporalExpressions: dedupeTemporalExpressions(modelNormalization.temporalExpressions),
    notes: modelNormalization.notes
  };
}

async function getModelNormalization(
  text: string,
  context: NormalizeRequest["context"]
): Promise<ModelNormalization> {
  await ensureModelAvailable();
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
      format: modelResponseSchema,
      options: { num_ctx: 4096 },
      messages: [
        {
          role: "system",
          content: [
            "ES UM PROCESSADOR DE TEXTO EM PORTUGUES DE PORTUGAL. Devolves apenas JSON valido.",
            "",
            "=== PASSO 1: CORRECAO ORTOGRAFICA ===",
            "Corrige erros de ortografia, acentos, gralhas e espacos partidos.",
            "Preserva SEMPRE: nomes proprios, siglas (EF, PT, UEFA), abreviacoes e o sentido original.",
            "Nao inventas informacao nova. Nao alteras frases que ja estao corretas.",
            "",
            "Exemplos de correcao:",
            "  'a manha setou na rueniao da EF' → 'Amanha estou na reuniao da EF'",
            "  'quaarta-feria bosa' → 'quarta-feira bolsa'",
            "  'reunao as 11h' → 'reuniao as 11h'",
            "  'amanha as 10' → 'amanha as 10' (ja correto)",
            "  'para amanha as 11 sobre a blosa' → 'para amanha as 11 sobre a bolsa'",
            "",
            "=== PASSO 2: EXPRESSOES TEMPORAIS ===",
            "Extrai e classifica todas as expressoes de tempo do texto corrigido.",
            "Nao calculas datas finais. Apenas classificas a expressao.",
            "",
            "Exemplos de classificacao:",
            "  'amanha' → {text:'amanha', kind:'relative_day', direction:'future', unit:'day', amount:1}",
            "  'hoje' → {text:'hoje', kind:'relative_day', direction:'current', unit:'day', amount:0}",
            "  'ontem' → {text:'ontem', kind:'relative_day', direction:'past', unit:'day', amount:1}",
            "  'depois de amanha' → {text:'depois de amanha', kind:'relative_day', direction:'future', unit:'day', amount:2}",
            "  'para a semana' → {text:'para a semana', kind:'relative_range', direction:'future', unit:'week', amount:1}",
            "  'semana passada' → {text:'semana passada', kind:'relative_range', direction:'past', unit:'week', amount:1}",
            "  'daqui a 3 dias' → {text:'daqui a 3 dias', kind:'relative_offset', direction:'future', unit:'day', amount=3}",
            "  'daqui a 2 semanas' → {text:'daqui a 2 semanas', kind:'relative_offset', direction:'future', unit:'week', amount:2}",
            "  'na quinta' → {text:'na quinta', kind:'weekday', weekday:'quinta'}",
            "  'na quarta-feira' → {text:'na quarta-feira', kind:'weekday', weekday:'quarta'}",
            "  'em abril' → {text:'em abril', kind:'month', month:'abril'}",
            "  'para o ano' → {text:'para o ano', kind:'relative_offset', direction:'future', unit:'year', amount:1}",
            "  'de manha' → {text:'de manha', kind:'part_of_day', partOfDay:'morning'}",
            "  'a tarde' → {text:'a tarde', kind:'part_of_day', partOfDay:'afternoon'}",
            "  'a noite' → {text:'a noite', kind:'part_of_day', partOfDay:'evening'}",
            "",
            `Data atual: ${context.currentDate} | Hora atual: ${context.currentTime} | Timezone: ${context.timezone}`,
            "",
            "Devolve apenas JSON valido segundo o schema fornecido."
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({ text })
        }
      ]
    })
  });

  if (!response.ok) {
    if (env.ollamaTimingLogs) {
      console.log(
        `[normalizer-service] Ollama /api/chat falhou em ${Date.now() - startedAt}ms (${response.status} ${response.statusText})`
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
    if (env.ollamaTimingLogs) {
      console.log(
        `[normalizer-service] Ollama /api/chat concluiu com fallback em ${Date.now() - startedAt}ms`
      );
    }
    return {
      correctedText: text,
      temporalExpressions: [],
      notes: ["fallback: invalid model JSON"]
    };
  }

  const correctedText =
    typeof parsed.correctedText === "string" && parsed.correctedText.trim()
      ? parsed.correctedText.trim()
      : text;

  const temporalExpressions = Array.isArray(parsed.temporalExpressions)
    ? parsed.temporalExpressions
    : [];

  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.filter((note): note is string => typeof note === "string")
    : [];

  const normalized = {
    correctedText,
    temporalExpressions,
    notes:
      typeof parsed.correctedText === "string"
        ? notes
        : ["fallback: model JSON sem correctedText", ...notes]
  };

  if (env.ollamaTimingLogs) {
    console.log(
      `[normalizer-service] Ollama /api/chat concluido em ${Date.now() - startedAt}ms`
    );
  }

  return normalized;
}

function applyHeuristicCorrections(text: string): string {
  let corrected = normalizeWhitespace(text);

  const replacements: Array<[RegExp, string]> = [
    [/\ba\s+manha\b/giu, "amanha"],
    [/\bde\s+manha\b/giu, "de manha"],
    [/\bdepois\s+de\s+a\s+manha\b/giu, "depois de amanha"],
    [/\bpas\s+sada\b/giu, "passada"],
    [/\bpas\s+sado\b/giu, "passado"],
    [/\bpro\s+xima\b/giu, "proxima"],
    [/\bpro\s+ximo\b/giu, "proximo"],
    [/\bsema\s+na\b/giu, "semana"],
    [/\bme\s+s\b/giu, "mes"],
    [/\bante\s+ontem\b/giu, "anteontem"]
  ];

  for (const [pattern, replacement] of replacements) {
    corrected = corrected.replace(pattern, replacement);
  }

  return corrected;
}

function dedupeTemporalExpressions(
  expressions: TemporalExpression[]
): TemporalExpression[] {
  const seen = new Set<string>();
  return expressions.filter((expression) => {
    const key = JSON.stringify(expression);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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
  const modelAlreadyAvailable = (tagsBody.models ?? []).some((model) => {
    const name = model.name ?? "";
    return name === env.model || name.startsWith(`${env.model}:`);
  });

  if (modelAlreadyAvailable) {
    return;
  }

  console.log(`[normalizer-service] Modelo ${env.model} nao encontrado. A fazer pull...`);

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
      `[normalizer-service] A aguardar que o Ollama fique pronto (${attempt}/${maxAttempts})...`
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

function validateNormalizeRequest(payload: unknown): asserts payload is NormalizeRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload invalido.");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.text !== "string" || record.text.trim().length === 0) {
    throw new Error("Campo 'text' em falta.");
  }
  if (!record.context || typeof record.context !== "object") {
    throw new Error("Campo 'context' em falta.");
  }
}

function safeJsonParse(value: string): ModelNormalization | null {
  for (const candidate of getJsonCandidates(value)) {
    try {
      return JSON.parse(candidate) as ModelNormalization;
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
    throw new Error("NORMALIZER_SERVICE_PORT deve ser um numero valido.");
  }
  if (!env.ollamaBaseUrl) {
    throw new Error("OLLAMA_BASE_URL e obrigatoria.");
  }
  if (!env.model) {
    throw new Error("NORMALIZER_MODEL e obrigatoria.");
  }
}

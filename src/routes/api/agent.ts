import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { AIModelType, AI_MODEL_CONFIGS } from "@/config/ai";
import {
  ensureGeminiProxyDispatcher,
  formatGeminiErrorMessage,
} from "@/lib/server/gemini";

/**
 * Agent chat route. Unlike /api/polish (which re-streams plain text and would
 * destroy tool calls), this forwards `messages` + `tools` and returns the
 * assistant message INCLUDING tool_calls, unmodified. The client-side agent
 * loop executes the tools against the Zustand store and calls back.
 */

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

const parseUpstreamError = (raw: string, fallback: string) => {
  if (!raw) return { message: fallback };
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return {
      message: data.error?.message || data.message || fallback,
      code: data.error?.code,
    };
  } catch {
    return { message: raw };
  }
};

// ---- JSON schema -> Gemini schema ----
const toGeminiSchema = (schema: any): any => {
  if (!schema || typeof schema !== "object") {
    return { type: SchemaType.STRING };
  }
  if (schema.type === "object") {
    const properties: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      properties[k] = toGeminiSchema(v);
    }
    const out: any = { type: SchemaType.OBJECT, properties };
    if (Array.isArray(schema.required)) out.required = schema.required;
    if (schema.description) out.description = schema.description;
    return out;
  }
  if (schema.type === "array") {
    const out: any = {
      type: SchemaType.ARRAY,
      items: toGeminiSchema(schema.items || { type: "string" }),
    };
    if (schema.description) out.description = schema.description;
    return out;
  }
  const map: Record<string, any> = {
    string: SchemaType.STRING,
    number: SchemaType.NUMBER,
    integer: SchemaType.INTEGER,
    boolean: SchemaType.BOOLEAN,
  };
  const out: any = { type: map[schema.type] || SchemaType.STRING };
  if (schema.description) out.description = schema.description;
  return out;
};

const toFunctionDeclarations = (tools: any[]) =>
  tools.map((t) => {
    const params = t.function?.parameters;
    const hasProps =
      params?.properties && Object.keys(params.properties).length > 0;
    return {
      name: t.function.name,
      description: t.function.description,
      ...(hasProps ? { parameters: toGeminiSchema(params) } : {}),
    };
  });

// ---- OpenAI messages -> Gemini contents (+ systemInstruction) ----
const toGeminiRequest = (messages: OpenAIMessage[]) => {
  const systemParts: string[] = [];
  const contents: any[] = [];
  // Map tool_call_id -> function name so tool results carry the fn name.
  const callIdToName: Record<string, string> = {};

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content) systemParts.push(String(msg.content));
      continue;
    }
    if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: String(msg.content ?? "") }] });
      continue;
    }
    if (msg.role === "assistant") {
      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) callIdToName[tc.id] = tc.function.name;
        contents.push({
          role: "model",
          parts: msg.tool_calls.map((tc) => {
            const part: any = {
              functionCall: {
                name: tc.function.name,
                args: safeParse(tc.function.arguments),
              },
            };
            const sig = (tc as any)._thoughtSignature;
            if (sig) part.thoughtSignature = sig;
            return part;
          }),
        });
      } else {
        contents.push({
          role: "model",
          parts: [{ text: String(msg.content ?? "") }],
        });
      }
      continue;
    }
    if (msg.role === "tool") {
      const fnName = msg.name || callIdToName[msg.tool_call_id || ""] || "tool";
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: fnName,
              response: { result: String(msg.content ?? "") },
            },
          },
        ],
      });
    }
  }

  // Coalesce consecutive same-role contents (Gemini dislikes repeats).
  const merged: any[] = [];
  for (const c of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === c.role) {
      last.parts.push(...c.parts);
    } else {
      merged.push({ role: c.role, parts: [...c.parts] });
    }
  }

  return { systemInstruction: systemParts.join("\n\n"), contents: merged };
};

const safeParse = (s?: string) => {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { apiKey, model, modelType, apiEndpoint, messages, tools } =
            body as {
              apiKey: string;
              model?: string;
              modelType: AIModelType;
              apiEndpoint?: string;
              messages: OpenAIMessage[];
              tools: any[];
            };

          if (!apiKey || !Array.isArray(messages)) {
            return Response.json(
              { error: "Missing API key or messages" },
              { status: 400 }
            );
          }
          const modelConfig = AI_MODEL_CONFIGS[modelType];
          if (!modelConfig) {
            return Response.json({ error: "Invalid model type" }, { status: 400 });
          }

          // ---- Gemini (SDK function calling) ----
          if (modelType === "gemini") {
            ensureGeminiProxyDispatcher();
            const genAI = new GoogleGenerativeAI(apiKey);
            const { systemInstruction, contents } = toGeminiRequest(messages);
            const modelInstance = genAI.getGenerativeModel({
              model: model || "gemini-flash-latest",
              systemInstruction: systemInstruction || undefined,
              tools: [{ functionDeclarations: toFunctionDeclarations(tools) }],
              generationConfig: { temperature: 0.3 },
            });

            const result = await modelInstance.generateContent({ contents });
            const response = result.response;
            // Iterate raw parts so we can preserve each functionCall's
            // thoughtSignature — Gemini rejects the next turn without it.
            const parts: any[] =
              response.candidates?.[0]?.content?.parts ?? [];
            const toolCalls: any[] = [];
            const texts: string[] = [];
            let idx = 0;
            for (const part of parts) {
              if (part.functionCall) {
                toolCalls.push({
                  id: `gem_${idx}_${part.functionCall.name}`,
                  type: "function",
                  function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args ?? {}),
                  },
                  _thoughtSignature: part.thoughtSignature,
                });
                idx++;
              } else if (typeof part.text === "string" && part.text) {
                texts.push(part.text);
              }
            }

            if (toolCalls.length > 0) {
              return Response.json({
                message: {
                  role: "assistant",
                  content: texts.join("") || null,
                  tool_calls: toolCalls,
                },
              });
            }
            return Response.json({
              message: {
                role: "assistant",
                content: texts.join("") || response.text(),
              },
            });
          }

          // ---- OpenAI-compatible (openai / deepseek / doubao) ----
          // Strip Gemini-only fields that may be present if the conversation
          // was started on Gemini and the provider was switched mid-chat.
          const cleanMessages = messages.map((m) =>
            m.role === "assistant" && m.tool_calls
              ? {
                  ...m,
                  tool_calls: m.tool_calls.map(
                    ({ ...tc }: any) => {
                      delete tc._thoughtSignature;
                      return tc;
                    }
                  ),
                }
              : m
          );
          const upstream = await fetch(modelConfig.url(apiEndpoint), {
            method: "POST",
            headers: modelConfig.headers(apiKey),
            body: JSON.stringify({
              model: modelConfig.requiresModelId ? model : modelConfig.defaultModel,
              messages: cleanMessages,
              tools,
              tool_choice: "auto",
              temperature: 0.3,
              stream: false,
            }),
          });

          if (!upstream.ok) {
            const raw = await upstream.text();
            const parsed = parseUpstreamError(
              raw,
              `Upstream API error: ${upstream.status}`
            );
            return Response.json({ error: parsed }, { status: upstream.status });
          }

          const data = (await upstream.json()) as {
            choices?: Array<{ message?: OpenAIMessage }>;
          };
          const message =
            data.choices?.[0]?.message ?? { role: "assistant", content: "" };
          return Response.json({ message });
        } catch (error) {
          console.error("Agent error:", error);
          const status =
            typeof (error as any)?.status === "number"
              ? (error as any).status
              : 500;
          return Response.json(
            { error: { message: formatGeminiErrorMessage(error) } },
            { status }
          );
        }
      },
    },
  },
});

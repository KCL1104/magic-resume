import type { AICredentials } from "@/lib/ai/client";
import { AGENT_TOOLS, executeAgentTool, serializeResumeForModel } from "./tools";

export interface AgentMessage {
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

export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, any> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; finalText: string }
  | { type: "error"; message: string };

const SYSTEM_PROMPT = `You are an AI resume editing assistant embedded directly in a resume editor. You help the user improve THE CURRENT RESUME by CALLING TOOLS — never just describe an edit, apply it with a tool.

Guidelines:
- The current resume is provided below as JSON. Use it to decide what to change.
- List sections (experience / projects / education / skills) use REPLACE semantics: when you call their setter you must pass the full list you want to keep (existing items you want to preserve + your additions/edits).
- Pass bullet points as arrays of plain-text strings; the app handles formatting. Do not send HTML.
- Preserve the user's real facts. Never invent employers, job titles, dates, degrees, or metrics that aren't supported by the existing resume or the user's message.
- You may call several tools in sequence. When you are done, reply with a short, friendly summary of what you changed, in the user's language.
- If the request is ambiguous or destructive, ask a brief clarifying question instead of guessing.`;

const safeParse = (s?: string): Record<string, any> => {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

const buildSystemMessage = (): AgentMessage => {
  const snapshot = serializeResumeForModel();
  return {
    role: "system",
    content: `${SYSTEM_PROMPT}\n\nCURRENT RESUME (JSON):\n${JSON.stringify(
      snapshot
    )}`,
  };
};

export interface RunAgentOptions {
  userText: string;
  /** Prior conversation (assistant/user/tool messages), WITHOUT the system message. */
  history: AgentMessage[];
  creds: AICredentials;
  signal?: AbortSignal;
  maxSteps?: number;
  onEvent?: (event: AgentEvent) => void;
}

export interface RunAgentResult {
  history: AgentMessage[];
  finalText: string;
}

/**
 * Run one user turn of the agent loop. Re-injects a fresh resume snapshot as the
 * system message each turn, executes any tool calls against the store, and feeds
 * results back until the model stops calling tools (or the step cap is hit).
 */
export const runAgent = async ({
  userText,
  history,
  creds,
  signal,
  maxSteps = 8,
  onEvent,
}: RunAgentOptions): Promise<RunAgentResult> => {
  const emit = (e: AgentEvent) => onEvent?.(e);

  // Rebuild messages with a fresh system snapshot each turn.
  const working: AgentMessage[] = [
    buildSystemMessage(),
    ...history,
    { role: "user", content: userText },
  ];

  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: creds.apiKey,
        model: creds.model,
        modelType: creds.modelType,
        apiEndpoint: creds.apiEndpoint,
        messages: working,
        tools: AGENT_TOOLS,
      }),
      signal,
    });

    const data = await response.json();
    if (!response.ok || data?.error) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.message || `Agent request failed (${response.status})`;
      emit({ type: "error", message });
      throw new Error(message);
    }

    const msg: AgentMessage = data.message;
    working.push(msg);

    if (msg.content) {
      finalText = String(msg.content);
      emit({ type: "assistant_text", text: finalText });
    }

    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        const args = safeParse(tc.function.arguments);
        emit({ type: "tool_call", name: tc.function.name, args });
        let result: string;
        try {
          result = executeAgentTool(tc.function.name, args);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
        emit({ type: "tool_result", name: tc.function.name, result });
        working.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: result,
        });
      }
      continue; // let the model react to the tool results
    }

    // No tool calls => the turn is complete.
    emit({ type: "done", finalText });
    return { history: working.slice(1), finalText };
  }

  finalText = finalText || "(reached the step limit)";
  emit({ type: "done", finalText });
  return { history: working.slice(1), finalText };
};

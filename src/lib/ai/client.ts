import { AI_MODEL_CONFIGS, AIModelType } from "@/config/ai";
import { useAIConfigStore } from "@/store/useAIConfigStore";

/**
 * Resolved, ready-to-send AI credentials for a single request.
 *
 * This centralizes the apiKey / modelId / endpoint selection logic that was
 * previously copy-pasted (as a nested ternary on `selectedModel`) inside
 * AIPolishDialog and useGrammarStore. New AI features (generate, agent) build
 * on this instead of adding a 4th copy.
 */
export interface AICredentials {
  modelType: AIModelType;
  apiKey: string;
  /** Resolved model id — the provider's default when it does not require an id. */
  model: string;
  /** Only set for OpenAI-compatible providers that need a custom endpoint. */
  apiEndpoint?: string;
}

type AIConfigState = ReturnType<typeof useAIConfigStore.getState>;

/**
 * Pick the apiKey / modelId / endpoint for the currently selected provider.
 * Mirrors the historical behavior in AIPolishDialog / useGrammarStore exactly.
 */
export const resolveAICredentials = (state: AIConfigState): AICredentials => {
  const selectedModel = state.selectedModel;
  const config = AI_MODEL_CONFIGS[selectedModel];

  const apiKey =
    selectedModel === "doubao"
      ? state.doubaoApiKey
      : selectedModel === "openai"
      ? state.openaiApiKey
      : selectedModel === "gemini"
      ? state.geminiApiKey
      : state.deepseekApiKey;

  const modelId =
    selectedModel === "doubao"
      ? state.doubaoModelId
      : selectedModel === "openai"
      ? state.openaiModelId
      : selectedModel === "gemini"
      ? state.geminiModelId
      : state.deepseekModelId;

  return {
    modelType: selectedModel,
    apiKey,
    model: config.requiresModelId ? modelId : config.defaultModel ?? modelId,
    apiEndpoint: selectedModel === "openai" ? state.openaiApiEndpoint : undefined,
  };
};

/** Convenience for non-React callers (stores, event handlers). */
export const getAICredentials = (): AICredentials =>
  resolveAICredentials(useAIConfigStore.getState());

/**
 * Assemble the base JSON body every AI route expects, merged with route-specific
 * fields (content, jd, tools, ...). Keeps the transport contract in one place.
 */
export const buildAIRequestBody = (
  creds: AICredentials,
  extra: Record<string, unknown>
): Record<string, unknown> => ({
  apiKey: creds.apiKey,
  model: creds.model,
  modelType: creds.modelType,
  apiEndpoint: creds.apiEndpoint,
  ...extra,
});

/** Providers that currently support tool/function calling (Slice C gate). */
export const TOOL_CALLING_PROVIDERS: AIModelType[] = [
  "openai",
  "gemini",
  "deepseek",
];

export const supportsToolCalling = (modelType: AIModelType): boolean =>
  TOOL_CALLING_PROVIDERS.includes(modelType);
